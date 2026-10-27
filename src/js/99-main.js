// Startup: restore the autosaved RCA after a crash or a closed tab, or start a new one.

(() => {
  let saved = null;
  // The autosave of the tool's earlier name is taken over once, then removed.
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)); localStorage.removeItem(LEGACY_STORAGE_KEY); } catch {}
  if (saved?.rca) {
    try {
      replaceState(normalizeProject(saved.rca), {saved: !saved.dirty});
      if (saved.dirty) setStatus('Recovered unsaved changes from ' + new Date(saved.savedAt).toLocaleString());
      return;
    } catch {}
  }
  replaceState(blankState());
})();
startDfmea();
