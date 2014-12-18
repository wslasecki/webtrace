/**
 * Add event listeners to the navigation window.
 */
WA.start = function() {
	// Attach browser onload handler
  if(window.addEventListener) {
    window.addEventListener('load', init_browser, false);
  } else if(window.attachEvent) {
    window.attachEvent('onload', init_browser);
  }

}
