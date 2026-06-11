/** @type {boolean} */
let voiceInstallInProgress = false;

/** @type {boolean} */
let voiceRuntimeStarting = false;

export function voiceInstallInFlight() {
  return voiceInstallInProgress;
}

export function setVoiceInstallInFlight(value) {
  voiceInstallInProgress = value;
}

export function tryBeginVoiceRuntimeStart() {
  if (voiceRuntimeStarting) return false;
  voiceRuntimeStarting = true;
  return true;
}

export function endVoiceRuntimeStart() {
  voiceRuntimeStarting = false;
}
