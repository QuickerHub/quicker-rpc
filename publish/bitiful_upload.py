#!/usr/bin/env python3
"""Upload QuickerAgent installer + version.txt to Bitiful S3-compatible storage."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from boto3.s3.transfer import TransferConfig

# Bitiful S3-compatible API can produce truncated objects with boto3 multipart upload.
# Keep agent installers (~70 MiB) on a single-part upload.
_SINGLE_PART_THRESHOLD_BYTES = 256 * 1024 * 1024


def parse_semver_from_setup_name(file_name: str) -> str:
    marker = file_name.replace("quicker-agent-", "").replace("-x64-setup.exe", "").strip()
    if not marker or marker == file_name:
        raise RuntimeError(f"Unable to parse semver from file name: {file_name}")
    return marker


def verify_remote_object_size(
    s3_client,
    *,
    bucket_name: str,
    object_key: str,
    expected_size: int,
) -> None:
    try:
        head = s3_client.head_object(Bucket=bucket_name, Key=object_key)
    except ClientError as exc:
        raise RuntimeError(
            f"Uploaded object missing or unreadable: s3://{bucket_name}/{object_key}"
        ) from exc

    remote_size = int(head["ContentLength"])
    if remote_size != expected_size:
        raise RuntimeError(
            f"Bitiful size mismatch for {object_key}: remote={remote_size} bytes, "
            f"local={expected_size} bytes"
        )


def upload_quicker_agent_installer(
    local_file: Path,
    *,
    access_key: str,
    secret_key: str,
    bucket_name: str,
    endpoint_url: str = "https://s3.bitiful.net",
    object_prefix: str = "quicker-rpc/quicker-agent",
) -> tuple[str, str, str]:
    if not local_file.is_file():
        raise FileNotFoundError(f"Installer not found: {local_file}")

    local_size = local_file.stat().st_size
    min_bytes = 50 * 1024 * 1024
    if local_size < min_bytes:
        raise RuntimeError(
            f"Installer too small ({local_size // (1024 * 1024)} MiB < 50 MiB): {local_file}"
        )

    prefix = object_prefix.strip().strip("/")
    object_key = f"{prefix}/{local_file.name}"
    version_txt_key = f"{prefix}/version.txt"
    version_marker = parse_semver_from_setup_name(local_file.name)

    s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint_url.rstrip("/"),
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", retries={"max_attempts": 5}),
    )
    transfer_config = TransferConfig(
        multipart_threshold=_SINGLE_PART_THRESHOLD_BYTES,
        max_concurrency=1,
        use_threads=False,
    )

    print(f"Uploading {local_file.name} ({local_size // (1024 * 1024)} MiB)...")
    s3_client.upload_file(
        str(local_file),
        bucket_name,
        object_key,
        ExtraArgs={"ContentType": "application/vnd.microsoft.portable-executable"},
        Config=transfer_config,
    )
    verify_remote_object_size(
        s3_client,
        bucket_name=bucket_name,
        object_key=object_key,
        expected_size=local_size,
    )

    s3_client.put_object(
        Bucket=bucket_name,
        Key=version_txt_key,
        Body=version_marker.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
        CacheControl="no-cache, no-store, must-revalidate",
    )

    base = endpoint_url.rstrip("/")
    object_url = f"{base}/{bucket_name}/{object_key}"
    version_txt_url = f"{base}/{bucket_name}/{version_txt_key}"
    return object_key, object_url, version_txt_url


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Upload QuickerAgent installer to Bitiful.")
    parser.add_argument("installer", type=Path, help="Path to quicker-agent-<semver>-x64-setup.exe")
    parser.add_argument(
        "--endpoint-url",
        default=os.getenv("BITIFUL_ENDPOINT_URL", "https://s3.bitiful.net"),
    )
    parser.add_argument(
        "--object-prefix",
        default=os.getenv("BITIFUL_OBJECT_PREFIX", "quicker-rpc/quicker-agent"),
    )
    args = parser.parse_args(argv)

    access_key = os.getenv("BITIFUL_ACCESS_KEY", "").strip()
    secret_key = os.getenv("BITIFUL_SECRET_KEY", "").strip()
    bucket_name = os.getenv("BITIFUL_BUCKET_NAME", "").strip()
    missing = [
        name
        for name, value in [
            ("BITIFUL_ACCESS_KEY", access_key),
            ("BITIFUL_SECRET_KEY", secret_key),
            ("BITIFUL_BUCKET_NAME", bucket_name),
        ]
        if not value
    ]
    if missing:
        print(f"Missing Bitiful credentials: {', '.join(missing)}", file=sys.stderr)
        return 1

    object_key, object_url, version_txt_url = upload_quicker_agent_installer(
        args.installer.resolve(),
        access_key=access_key,
        secret_key=secret_key,
        bucket_name=bucket_name,
        endpoint_url=args.endpoint_url.strip(),
        object_prefix=args.object_prefix.strip(),
    )
    print(f"Uploaded: {object_key}")
    print(f"URL: {object_url}")
    print(f"Version URL: {version_txt_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
