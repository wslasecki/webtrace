WA.start = function() {
  var onload = function() {
    var keydown_func = function(e) {
      if(!e) e = window.event;

      var key = WA.Keyboard.getKeyString(e);

      if(key.toLowerCase() == 't') {
        setTimeout(function() {init_browser(); newPage();}, 0);
      }
    };

    if(window.attachEvent) document.attachEvent('keydown', keydown_func);
    else if(window.addEventListener) document.addEventListener('keydown', keydown_func, false);
  };

  if(window.attachEvent) window.attachEvent('onload', onload);
  else if(window.addEventListener) window.addEventListener('load', onload, false);

  // Focus the body so we'll get keydown events.
  if(document.body) document.body.focus();
};
