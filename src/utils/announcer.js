/**
 * Screen reader live announcer utility.
 * Clears the announcer element first, then sets the message after a brief delay
 * so assistive technology detects the content change.
 * @param {string} message - The message to announce
 */
export function announce(message) {
  const el = document.getElementById('sr-announcer');
  if (el) {
    el.textContent = '';
    setTimeout(() => {
      el.textContent = message;
    }, 100);
  }
}
