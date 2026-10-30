// Opens a new tab right away (while the click still counts, so the browser allows it) and points it at an address once a
// slow action finishes. Call the returned function with the address, or with nothing to close the empty tab.
export function openLater(): (url?: string) => void {
  const tab = window.open("", "_blank");
  return (url?: string) => {
    if (!tab) return;
    if (url) tab.location.href = url;
    else tab.close();
  };
}
