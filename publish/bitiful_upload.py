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


def upload_release_asset(
    local_file: Path,
    *,
    access_key: str,
    secret_key: str,
    bucket_name: str,
    endpoint_url: str = "https://s3.bitiful.net",
    object_prefix: str = "quicker-rpc/voice-asr",
    content_type: str = "application/zip",
) -> tuple[str, str]:
    if not local_file.is_file():
        raise FileNotFoundError(f"Asset not found: {local_file}")

    local_size = local_file.stat().st_size
    min_bytes = 1 if local_file.suffix.lower() == ".json" else 1024
    if local_size < min_bytes:
        raise RuntimeError(f"Asset too small ({local_size} bytes): {local_file}")

    prefix = object_prefix.strip().strip("/")
    object_key = f"{prefix}/{local_file.name}"

    resolved_content_type = content_type
    if local_file.suffix.lower() == ".json":
        resolved_content_type = "application/json; charset=utf-8"

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
        ExtraArgs={"ContentType": resolved_content_type},
        Config=transfer_config,
    )
    verify_remote_object_size(
        s3_client,
        bucket_name=bucket_name,
        object_key=object_key,
        expected_size=local_size,
    )

    base = endpoint_url.rstrip("/")
    object_url = f"{base}/{bucket_name}/{object_key}"
    return object_key, object_url


def write_version_txt(
    version: str,
    *,
    access_key: str,
    secret_key: str,
    bucket_name: str,
    endpoint_url: str = "https://s3.bitiful.net",
    object_prefix: str = "quicker-rpc/voice-asr",
) -> str:
    prefix = object_prefix.strip().strip("/")
    version_txt_key = f"{prefix}/version.txt"
    marker = version.strip()
    if not marker:
        raise RuntimeError("version marker is empty")

    s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint_url.rstrip("/"),
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", retries={"max_attempts": 5}),
    )
    s3_client.put_object(
        Bucket=bucket_name,
        Key=version_txt_key,
        Body=marker.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
        CacheControl="no-cache, no-store, must-revalidate",
    )
    base = endpoint_url.rstrip("/")
    return f"{base}/{bucket_name}/{version_txt_key}"


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


def _load_bitiful_credentials() -> tuple[str, str, str]:
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
        raise RuntimeError(f"Missing Bitiful credentials: {', '.join(missing)}")
    return access_key, secret_key, bucket_name


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Upload QuickerHub release assets to Bitiful.")
    parser.add_argument(
        "path",
        type=Path,
        help="Installer (.exe) or release asset (.zip)",
    )
    parser.add_argument(
        "--asset",
        action="store_true",
        help="Upload as generic release asset (skip installer validation)",
    )
    parser.add_argument(
        "--version",
        default="",
        help="Write version.txt after upload (voice-asr release version)",
    )
    parser.add_argument(
        "--write-version-only",
        action="store_true",
        help="Only write version.txt (requires --version)",
    )
    parser.add_argument(
        "--endpoint-url",
        default=os.getenv("BITIFUL_ENDPOINT_URL", "https://s3.bitiful.net"),
    )
    parser.add_argument(
        "--object-prefix",
        default="",
        help="S3 object prefix (default from BITIFUL_OBJECT_PREFIX or quicker-agent)",
    )
    args = parser.parse_args(argv)

    try:
        access_key, secret_key, bucket_name = _load_bitiful_credentials()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    endpoint_url = args.endpoint_url.strip()
    default_prefix = (
        "quicker-rpc/voice-asr"
        if args.asset or args.write_version_only
        else os.getenv("BITIFUL_OBJECT_PREFIX", "quicker-rpc/quicker-agent")
    )
    object_prefix = (args.object_prefix or default_prefix).strip()
    local_path = args.path.resolve()

    if args.write_version_only:
        if not args.version.strip():
            print("--write-version-only requires --version", file=sys.stderr)
            return 1
        version_txt_url = write_version_txt(
            args.version.strip(),
            access_key=access_key,
            secret_key=secret_key,
            bucket_name=bucket_name,
            endpoint_url=endpoint_url,
            object_prefix=object_prefix,
        )
        print(f"Version URL: {version_txt_url}")
        return 0

    if args.asset:
        object_key, object_url = upload_release_asset(
            local_path,
            access_key=access_key,
            secret_key=secret_key,
            bucket_name=bucket_name,
            endpoint_url=endpoint_url,
            object_prefix=object_prefix,
            content_type="application/octet-stream",
        )
        print(f"Uploaded: {object_key}")
        print(f"URL: {object_url}")
        if args.version.strip():
            version_txt_url = write_version_txt(
                args.version.strip(),
                access_key=access_key,
                secret_key=secret_key,
                bucket_name=bucket_name,
                endpoint_url=endpoint_url,
                object_prefix=object_prefix,
            )
            print(f"Version URL: {version_txt_url}")
        return 0

    object_key, object_url, version_txt_url = upload_quicker_agent_installer(
        local_path,
        access_key=access_key,
        secret_key=secret_key,
        bucket_name=bucket_name,
        endpoint_url=endpoint_url,
        object_prefix=object_prefix,
    )
    print(f"Uploaded: {object_key}")
    print(f"URL: {object_url}")
    print(f"Version URL: {version_txt_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
