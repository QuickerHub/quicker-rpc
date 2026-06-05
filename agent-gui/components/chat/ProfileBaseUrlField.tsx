"use client";

import { useEffect, useState } from "react";
import {
  CUSTOM_BASE_URL_PRESET_ID,
  findBaseUrlPreset,
  LLM_PROFILE_BASE_URL_PRESETS,
} from "@/lib/llm-profile-base-url-presets";

type ProfileBaseUrlFieldProps = {
  idPrefix: string;
  value: string;
  onChange: (baseURL: string) => void;
  disabled?: boolean;
};

export function ProfileBaseUrlField({
  idPrefix,
  value,
  onChange,
  disabled = false,
}: ProfileBaseUrlFieldProps) {
  const matchedPreset = findBaseUrlPreset(value);
  const [preferCustom, setPreferCustom] = useState(!matchedPreset);

  useEffect(() => {
    if (matchedPreset) setPreferCustom(false);
  }, [matchedPreset?.id]);

  const selectValue = preferCustom || !matchedPreset
    ? CUSTOM_BASE_URL_PRESET_ID
    : matchedPreset.baseURL;

  return (
    <div className="ws-settings-field">
      <span className="ws-settings-field-label" id={`${idPrefix}-baseURL-label`}>
        Base URL
      </span>
      <select
        id={`${idPrefix}-baseURL-preset`}
        className="ws-settings-input"
        value={selectValue}
        disabled={disabled}
        aria-labelledby={`${idPrefix}-baseURL-label`}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CUSTOM_BASE_URL_PRESET_ID) {
            setPreferCustom(true);
            return;
          }
          setPreferCustom(false);
          onChange(next);
        }}
      >
        {LLM_PROFILE_BASE_URL_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.baseURL}>
            {preset.label}
          </option>
        ))}
        <option value={CUSTOM_BASE_URL_PRESET_ID}>自定义…</option>
      </select>
      <input
        id={`${idPrefix}-baseURL`}
        type="url"
        className="ws-settings-input"
        value={value}
        placeholder="https://api.example.com/v1"
        disabled={disabled}
        aria-labelledby={`${idPrefix}-baseURL-label`}
        onChange={(event) => {
          setPreferCustom(!findBaseUrlPreset(event.target.value));
          onChange(event.target.value);
        }}
      />
    </div>
  );
}
