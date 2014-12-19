/*
 * Main WebAnywhere script.
 * /scripts/wa.js
 * 
 * This script provides the main functionality for reading through a web page,
 * skipping through a web page, handling new page loads, capturing user input,
 * etc.
 */

// Information about the document that the system is currently reading.
var currentLoc = null;
var currentDoc = null;

// Array of Document objects currently in the system. 
var nDocuments=new Array();

// The current reading position (caret).
var currentNode = null;
var currentWord = 0;
var currentChar = 0;

// Last currentNode.
var lastNode = null;

// The last node to be played by the system.
var lastNodePlayed = null;

// Keeps track of whether a programmatic focus was requested.
var programmaticFocus = false;

// Last element to have received focus.
// TODO:  Add a page-level focus event that updates this.
var lastFocused = null;

// Records whether a textbox has the current focus.
var textBoxFocused = false;

// Boolean used to set if we're waiting on a page to load.
var waiting_on_page = "";

// Node last focused.
var focusedNode = null;

// Should the actions of the user be recorded?
// This is used for user studies and should be kept to 'false' at most times.
var recordActions = false;

// 0 none, 1 JAWS, 2 Window-Eyes
var emulationType = 0;

// Counts number of times that updatePlaying() has been called.
// Something like the clock tick of the system.
var updatePlayingCount = 0;

/**
 * Initializes the WebAnywhere browser.
 * Called when the frameset page loads.
 */
function init_browser() {
	// Start by focusing the location bar.

  // Mark the browser as having been initialized.
  WA.browserInit = true;

  // Hack for resetting the keyboard events, currently once every 45 seconds.
  // TODO:  Figure out what the underlying problem is that makes this necessary.
  setInterval(function() {WA.Keyboard.resetKeyboardModifiers();}, 45000);

  // Prepares the location bar, attaches events, etc.
  WA.Interface.setupLocationBar();

  // GO button focus.
  var go_button = document.getElementById('location_go');
  if(go_button) {
	  if(window.attachEvent) go_button.attachEvent('onfocus', goButtonFocus);
	  else if(window.addEventListener) go_button.addEventListener('focus', goButtonFocus, false);
  }

  // Finder field focus.
  var finder_field = document.getElementById('wa_finder_field');
  if(finder_field) {
    if(window.attachEvent) finder_field.attachEvent('onfocus', browserElementFocus);
    else if(window.addEventListener) finder_field.addEventListener('focus', browserElementFocus, false);
  }

  // Find next focus.
  var find_next = document.getElementById('find_next_button');
  if(find_next) {
    if(window.attachEvent) find_next.attachEvent('onfocus', browserElementFocus);
    else if(window.addEventListener) find_next.addEventListener('focus', browserElementFocus, false);
  }

  // Find previous focus.
  var find_previous = document.getElementById('find_previous_button');
  if(find_previous) {
    if(window.attachEvent) find_previous.attachEvent('onfocus', browserElementFocus);
    else if(window.addEventListener) find_previous.addEventListener('focus', browserElementFocus, false);
  }

  // Window-level key event handlers.
  // Event handlers also attached in newPage to catch events
  // when content is focused.
  if(window.attachEvent) document.attachEvent('onkeydown', handleKeyDown);
  else if(window.addEventListener) document.addEventListener('keydown', handleKeyDown, false);

  if(window.attachEvent) document.attachEvent('onkeyup', handleKeyUp);
  else if(window.addEventListener) document.addEventListener('keyup', handleKeyUp, false);

  if(window.attachEvent) document.attachEvent('onkeypress', handleKeyPress);
  else if(window.addEventListener) document.addEventListener('keypress', handleKeyPress, false); 


  if(document.attachEvent)
    document.getElementById('content_frame').attachEvent('onload', newPage);
  else if(document.addEventListener)
    document.getElementById('content_frame').addEventListener('load', newPage, false);
  document.getElementById('content_frame').removeAttribute('onload');
  document.getElementById('content_frame').setAttribute('onload', '');
  document.getElementById('content_frame').onload = function() {};
}

/**
 * Called when a new page loads.
 * Adds event handlers, pre-processes content when appropriate.
 */
function newPage(e) {
  // Reset the last focused node since it no longer exists.
  lastFocused = null;
  lastNode = null;

  var content_frame = top.document.getElementById("content_frame");
  if(content_frame) {
    var src = content_frame.src;
    WA.Utils.log('In newPage, content_frame.src is: ' + src);

    if(src.indexOf(top.webanywhere_url)!=0) {
      var location_field = document.getElementById('location');
      if(/mail\.google\.com\/mail/.test(location_field.value) &&
          !(/ui=?html/i.test(location_field.value))) {
        setContentLocation('https://mail.google.com/mail/?ui=html&zy=f');
      } else {}
    }
  }

  try {
  var newDoc = getContentDocument();
  } catch(e) {
    return;
  }

  var newLoc = WA.Interface.getLocationFromDoc(newDoc);  // Document URL.

  // Sometimes we get multiple loads from the same page.
  var startNode = newDoc.getElementById('id');

  if(newDoc != currentDoc && (!startNode ||currentLoc != newLoc)) {
    var location_field = document.getElementById('location');
    if(location_field) {
      if(/mail\.google\.com\/mail/.test(location_field.value) && !(/ui=?html/.test(location_field.value))) {
        setContentLocation('https://mail.google.com/mail/?ui=html&zy=f');
      }

      location_field.value = WA.Interface.getURLFromProxiedDoc(newDoc);
    }

    // Update the current nodes.
    currentDoc = newDoc;
    //setCurrentNode((currentDoc.body.firstChild != null) ? currentDoc.body.firstChild : currentDoc.body);
    setCurrentNode(currentDoc.body);

    currentLoc = newLoc;
      
    // Capture key presses.
    if(window.attachEvent) currentDoc.attachEvent('onkeydown', handleKeyDown);
    else if(window.addEventListener) currentDoc.addEventListener('keydown', handleKeyDown, false);
  
    if(window.attachEvent) currentDoc.attachEvent('onkeyup', handleKeyUp);
    else if(window.addEventListener) currentDoc.addEventListener('keyup', handleKeyUp, false);
  
    if(window.attachEvent) currentDoc.attachEvent('onkeypress', handleKeyPress);
    else if(window.addEventListener) currentDoc.addEventListener('keypress', handleKeyPress, false);

    // Special case for our WebAnywhere audio description button.
    var desc_butt = currentDoc.getElementById('webanywhere-audio-description');
    if(desc_butt) {

      // Check to see if we should play the WebAnywhere description.
      if(window.attachEvent)
        desc_butt.attachEvent('onclick', playDesc);
      else if(window.addEventListener)
        desc_butt.addEventListener('click', playDesc, false);
    }


    // Populate the nDocuments array in prep for counting headings and links
    // First, make sure nDocuments is zeroed out from previously loaded docs.
    nDocuments.length = 0;
    nDocuments.push(currentDoc);
    buildDocumentStack(currentDoc);

    //
    // EXTENSIONS
    //
    
    // Reset extensions.
    WA.Extensions.resetExtensions();

    // Preprocess the page, including adding to the list of nodes
    // to be prefetched, and other preprocessing steps.
    // Calls WA.Extensions.preprocessNode(node) to preprocess for extensions.
    WA.Nodes.treeTraverseRecursion(currentNode, preVisit, function(node){return WA.Nodes.leafNode(node);});

    // Run any extensions that requests to be run once per document.
    // This is assumed to run prior to the node preprocessor.
    // WA.Extensions.runOncePerDocument(currentDoc);
    WA.Extensions.runOncePerDocument(nDocuments);

    // Create an artificial focusable start element containg the page title.
    var start_node = currentDoc.createElement('div');
    start_node.innerHTML = currentDoc.title;
    if(start_node.tabIndex) { // IE.
      start_node.tabIndex = 0;
    }
    start_node.setAttribute('tabindex', 0);
    start_node.setAttribute('id', 'always_first_node');
    currentDoc.body.insertBefore(start_node, currentDoc.body.firstChild);

    // Create an artificial focusable end element.
    var end_node = currentDoc.createElement('div');
    end_node.innerHTML = wa_gettext("End of page");
    if(end_node.tabIndex) { // IE.
      end_node.tabIndex = 0;
    }
    end_node.setAttribute('tabindex', 0);
    end_node.setAttribute('id', 'always_last_node');
    currentDoc.body.appendChild(end_node);

  }

  // Reset the keyboard modifiers, in case we missed the release of one
  // while page was loading.
  WA.Keyboard.resetOnNewPage();


  // Count number of pages loaded.
  WA.timesLoaded++;

  WA.Utils.log("finished new page load");

  WA.Utils.log("PAGE HAS LOADED");

  setBrowseMode(WA.PAUSED);
}

/**
 * Wrappers for key event handlers that handle namespace issues.
 * @param Event
 */
function handleKeyDown(e) {
	WA.Keyboard.handleKeyDown(e);
}
function handleKeyUp(e) {
  WA.Keyboard.handleKeyUp(e);
}
function handleKeyPress(e) {
  WA.Keyboard.handleKeyPress(e);
}

/**
 * Called when the finder box receives focus.
 */
function finderBarFocus() {
}

/**
 * Called in response to the focus event on the browser frame's "GO" button.
 * @param e Focus event.
 **/
function goButtonFocus(e) {
  var target;
  if(!e) e = window.event;
  if(e.target) target = e.target;
  else if(e.srcElement) target = e.srcElement;
  if(target.nodeType == 3)
    target = target.parentNode;

  var text = WA.Nodes.handleNode(target, true);
}

/**
 * Focus event handler for elements in the browser frame.
 * @param e Event.
 */
function browserElementFocus(e) {
  var target;
  if(!e) e = window.event;
  if(e.target) target = e.target;
  else if(e.srcElement) target = e.srcElement;
  if(target.nodeType == 3)
    target = target.parentNode;

  var text = WA.Nodes.handleNode(target, true);
}

/**
 * Called when users hit a key when the last node in the page has focus.
 * Current responds to the "tab" combination.
 * @param e Keydown event.
 **/
function tabEndNode(e) {
  var key = getNavigationDocument().keyString(e);
  if(key == 'tab') {
    stopProp(e);
    return false;
  }
}

/**
 * Called when users hit a key when the first node in the page is focused.
 * Current responds to the "shift tab" combination.
 * @param e Keydown event.
 * @return false  Prevents the event from bubbling up.
 **/
function tabStartNode(e) {
  var key = getNavigationDocument().keyString(e);
  if(key == 'shift tab') {
    var go_butt =
      getNavigationDocument().getElementById('location_go');
    go_butt.focus();
    stopProp(e);
    return false;
  }
}

/**
 * Called when the user hits the TAB key from the location bar.
 * @param e Keydown event.
 * @return false Prevents the event from bubbling up.
 **/
function tabLocation(e) {
  var key = getNavigationDocument().keyString(e);
  if(key == 'ctrl l') {
    stopProp(e);
    return false;
  } else if(key == 'shift tab') {
    stopProp(e);
    return false;
  }
}

/** A flexible "focus element" function.
 * Focuses the element with the provided ID in the provided document.
 * @param doc Document in which the element exists.
 * @param element_id ID of the element to focus.
 **/
function focusElement(doc, element_id) {
  setBrowseMode(WA.PAUSED);

  var elem = doc.getElementById(element_id);
  if(elem) {
    elem.blur();
    elem.focus();
    if(elem.select) {
      elem.select();
    }
    setCurrentNode(elem);
    lastFocused = elem;
  }
}

/** Sets focus to the content element with the specified id.
 * @param element_id  The id of the element to which focus will be set.
 **/
function focusContentElement(element_id) {
  var doc = getContentDocument();
  focusElement(doc, element_id);  
}

/**
 * Returns the content document.
 * @return document Content document.
 */
function getContentDocument() {
  var win = getContentWindow();
  return win.document;
}

/**
 * getContentWindow
 * Returns the content window.
 * @return window Content window.
 */
function getContentWindow() {
  if(typeof top.content_frame != 'undefined') {
    return top.content_frame;
  } else {
    return top;
  }	
}

/**
 * Returns the first node of the web page.
 * @return HTMLElement Returns the first node of the current content document.
 */
function getFirstContent() {
  var doc = getContentDocument();
  var first = doc.getElementById('always_first_node');
  if(!first && doc.body && doc.body.firstChild) {
    first = doc.body.firstChild;
  }

  return first;
}

/**
 * Returns the last node of the web page.
 * @return DOMElement Last node on the content page.
 */
function getLastContent() {
  var doc = getContentDocument();
  var last = doc.getElementById('always_last_node');
  if(!last && doc.body && doc.body.lastChild) {
    last = doc.body.lastChild;
  }

  return last;
}

/**
 * Gets the document element of the Navigation element.
 * @return docElement Document element of the navigation frame.
 */
function getNavigationDocument() {
	if("navigation_frame" in top) {
    return top.navigation_frame.document;
	} else {
		return top.document;
	}
}

/**
 * Returns the window where the code is kept.
 * In WebAnywhere browser, mode this means the navigation frame.
 * In site-specific mode, this means the main window.
 * @return window
 */
function getScriptWindow() {
  	if("navigation_frame" in top) {
  	  getScriptWindow = function() { return top.navigation_frame; }
  		return top.navigation_frame;
  	} else {
      getScriptWindow = function() { return top; }
  		return top;
  	}
}

/**
 * Returns the current position of the cursor in the specified field.
 * @param myField Field in which to determine the cursor position.
 * @return Integer Cursor position, or negative error value.
 */
function getCursor(myField) {
  if(!myField) {
    return -3;
  }
  if(!myField.value || myField.value == '') {
    return 0;
  } else if(document.selection) {
    var delim = "deliim";
    myField.focus();
    sel = document.selection.createRange();
    sel.text = delim;
    var pos = myField.value.indexOf("deliim");
    myField.value = myField.value.replace(/deliim/, '');
    return pos;
  } else if(myField.selectionStart || myField.selectionStart == '0') {
    var startPos = myField.selectionStart;
    return startPos;
  }
  return '-2';
}

function stopProp(e) {
  if(e.stopPropagation) {
    e.stopPropagation();
    e.preventDefault();
  } else {
    e.cancelBubble = true;
    e.returnValue = false;
    e.keyCode = 0;
  }
  return false;
}

var refocusedSelect = null;
function refocusSelect() {
  getScriptWindow().programmaticFocus = true;
  refocusedSelect.focus();
}

/**
 * Plays a single key press.
 * Determines what to play based on the target element.
 * @param key String representation of the key combination that was pressed.
 * @param targ Target element of the key event.
 */
function _playkey(key, targ) {
  setBrowseMode(getScriptWindow().WA.KEYBOARD);

  if(/ctrl l/.test(key)) {
  } else if(/arrow|backspace|del/.test(key)) {
    var pos = getScriptWindow().getCursor(targ);
    var text = targ.value;
    if(/left|right|backspace|del/.test(key)) {
      if(/left/.test(key)) {
        text = text.substring((pos-1), pos);
      } else if(/right/.test(key)) {
        text = text.substring(pos+1, (pos+2));
      } else if(/backspace/.test(key)) {
        text = text.substring((pos-1), pos);
      } else if(/del/.test(key)) {
        text = text.substring(pos, pos+1);
      }
      if(!text || text=="") {
      	text = "blank";
      }
    }
  } else if(key=="enter") {
  } else {
  }
}

/**
 * preVisit
 * Called on each node upon page load.
 * Performs a number of administrative functions.
 * @param node Node to pre-visit.
 **/
function preVisit(node) {
  // Add the text for each node to the prefetching queueu.
  if(WA.prefetchStrategy >= 1) {
  	var text = WA.Nodes.handleNode(node, true);
  }

  // Perform node preprocessing specified in extensions.
  WA.Extensions.preprocessNode(node);
}

/**
 * Event handler for changes to select elements.
 * @param key_string String generated by the key event handler.
 * @param target Selection Element.
 */
function selectChange(key_string, target) {
  if(/ctrl arrow(up|down)/.test(key_string)) {
    if(/ctrl/.test(key_string)) {
      setBrowseMode(WA.KEYBOARD);

      var sindex = target.selectedIndex;
      if(/down/.test(key_string)) {
      sindex = (sindex + 1 < target.options.length) ? sindex + 1 : sindex;
      } else if(/up/.test(key_string)) {
      sindex = (sindex - 1 >= 0) ? sindex - 1 : sindex;
      }

      if(WA.Utils.isIE()) {
        target.selectedIndex = sindex;
      }

      var text_value = target.options[sindex].innerHTML; //value;
    }
  }
}

/**
 * Focuses the first node of the document and resets the reading to start
 * back at the beginning.
 * @param e Focus event on the start node.
 **/
function startNodeFocus(e) {
}

/**
 * Focuses the end node and resets the reading to last node in the document.
 * @param e Focus event on the start node.
 **/
function endNodeFocus(e) {
}

/**
 * Goes back one step in the history.
 **/
function goBack() {
  var contentDoc = getContentDocument();
  if(contentDoc.history && contentDoc.history.back) {
  	contentDoc.history.back();
  }
}

/**
 * Goes forward one step in the history.
 **/
function goForward() {
  var contentDoc = getContentDocument();
  if(contentDoc.history && contentDoc.history.forward) {
  	contentDoc.history.forward();
  }
}

/**
 * Called by event handlers for the location bar and the 'Go' button submit.
 * @param e Submit or Click event.
 **/
function navigate(e) {

  var loc = document.getElementById('location');
  var loc_val = loc.value;

  // GMail-specific redirection.
  if((/^(https?:\/\/)?((www\.)?gmail\.com|mail\.google\.com)/.test(loc_val)) &&
      !(/ui=?html/.test(loc_val))) {
    loc_val = "https://mail.google.com/mail/?ui=html&zy=a";
  } else if(loc_val.match(/\.pdf$/)) {
    loc_val = "http://www.google.com/search?q=cache:" + loc_val;
  }
  loc.value = loc_val;
  WA.Utils.log('In navigate, loc.value is: '+loc.value);

  setContentLocation(loc_val);
}

var sameDomainRegExp = new RegExp("^(https?://)?" + top.webanywhere_domain);

/**
 * Makes URL come from same domain as WebAnywhere using the web proxy.
 * The subdomain (if supplied) is tacked on to the front.
 * @param loc String location to proxify.
 * @param subdomain
 * @param cacheable Can the location be cached?
 * @param rewrite Should loc be rewritten.
 * @return String of rewritten location.
 **/
function proxifyURL(loc, subdomain, cacheable, rewrite) {
  var rewriteForSure = (typeof rewrite != 'undefined') && rewrite;

  // No need to proxy from our own server;
  // can cause problems when running on localhost.
  if(top.web_proxy_url && (rewriteForSure || !sameDomainRegExp.test(loc)) && !(/^\//.test(loc))) {
    loc = top.web_proxy_url.replace(/\$url\$/, WA.Utils.Base64.encode64(loc));
    if(subdomain && subdomain.length > 0) {
      loc = top.webanywhere_location + loc;
      loc = loc.replace(top.webanywhere_domain,
      			  (subdomain + '.' + top.webanywhere_domain));
    }
  }

  if(!cacheable) {
    // Add delay post information.
    loc = WA.Utils.addDelayPost(loc);
  }

  return loc;
}

// Regular expression used to separate out pieces of the URL.
var domainRegExp = /^(https?:\/\/)?([^\/]+\.[^\/]+[^\/]*)/;

/**
 * Called to set the location of content frame.
 * @param loc String location.
 **/ 
function setContentLocation(loc) {
  var dmatches = String(loc).match(domainRegExp);

  var domain_requested = "";

  if(top.cross_domain_security) {
    if(dmatches && dmatches.length > 2) {
      domain_requested = dmatches[2];
    } else { // Domain is invalid.
    }
  }

  loc = proxifyURL(loc, domain_requested, false);

  WA.Utils.log('location is ' + loc);

  setBrowseMode(WA.LOOPING);

  // Set new location by setting the src attribute of the content frame.
  // Do not set the location of the frame document because WebAnywhere can
  // lose control of this because of redirects, etc.
  var contentDoc = getContentDocument();
  var content_frame = top.document.getElementById('content_frame');
  if(content_frame != null) {
    content_frame.setAttribute('src', loc);
  }
}


/**
 * Adds the specified node to the prefetch queue.
 * @param node Node to prefetch.
 **/
function addNodeToPrefetch(node) {
  text = WA.Nodes.handleNode(node, true);

}

/**
 * Responds to user-initiated focus events,
 * such as those triggered by the mouse.
 * Currently not used due to partial implementation.
 * @param e Focus event.
 **/ 
function gotFocus(e) {
  /*
  var targ;
  if(!e) e = window.event;
  if(e.target) targ = e.target;
  else if(e.srcElement) targ = e.srcElement;
  if(targ.nodeType == 3)
    targ = targ.parentNode;

  if( !getScriptWindow().programmaticFocus ) {
    var dnode = getScriptWindow().dfsNode(targ);
    getScriptWindow().setCurrentNode(dnode);
    var test_div = getScriptWindow().document.getElementById('test_div');
    test_div.innerHTML = "got focus " + targ.nodeName + ' ' + targ + ' ' + getScriptWindow().programmaticFocus;

    setBrowseMode(WA.PLAY_ONE);
  } else {
  }

  focusedNode = targ;

  getScriptWindow().programmaticFocus = false;*/
}

/**
 * Play the previous character.
 */
function prevChar() {
  var node_text = WA.Nodes.handleNode(currentNode, true);
  if(node_text) {
    setBrowseMode(WA.KEYBOARD);
    var curr = getCurrentChar();
    if(curr > 0 && curr <= node_text.length) {
      setCurrentChar(curr-1);
    } else {
      setBrowseMode(WA.PREV_CHAR_BACKONE);
      prevNode();
    }
  } else {
    prevNode();
  }
}

/**
 * Sets node that will be at the current cursor location.
 **/
function setCurrentNode(node) {
  getScriptWindow().currentNode = node;
  setCurrentChar(-1);
}

// Sets the character at the current cursor location.
function setCurrentChar(pos) {
  getScriptWindow().currentChar = pos;  
}

// Returns the character at the current cursor location.
function getCurrentChar() {
  return getScriptWindow().currentChar;
}

//----------------------- START ADVANCE TO TAG ---------------------

// Returns a function that return true when a provided elem has
// the specified name (tag) and attribute (attrib).
function matchByTag(tag, attrib) {
  var matchByTagFunc = function(elem) {
 	return isTagAttribute(elem, tag, attrib);
  };
  return matchByTagFunc;
}

// Determines if a tag is visible.
// Tags that aren't visible, shouldn't be read.
/*function isVisible(elem) {
  WA.Utils.log('In isVisible');
  if(elem.nodeType == 1) {
  	if(elem.tagName == "INPUT") {
      var input_type = elem.getAttribute('type');
      if(input_type && /hidden/i.test(input_type)) {
        return false;
      }
  	}
  }

  // Default is that it's visible.
  return true;  
}*/


// Functions for navigating within a table.
function nextTableRow(node) {
  return navTableCell(node, 1, 0, "end of table");
}
function prevTableRow(node) {
  return navTableCell(node, -1, 0, "start of table");
}
function nextTableCol(node) {
  return navTableCell(node, 0, 1, "end of table");
}
function prevTableCol(node) {
  return navTableCell(node, 0, -1, "start of table");
}

// Primary function for navigating within a table.
function navTableCell(node, row_offset, col_offset, edge_message) {
  if(!node) return null;
	
  var matching_row = null;
  var matching_col = null;

  do {
  	if(node.nodeName == "TD") {
  	  matching_col = node;
  	}
    node = node.parentNode; 
  } while(node && node.nodeName != "TR");
  matching_row = node;

  var rowIndex = -1;
  var colIndex = -1;
  if(matching_row && matching_row.nodeName == "TR") {
    rowIndex = matching_row.rowIndex;    
  }
  if(matching_col && matching_col.nodeName == "TD") {
  	colIndex = matching_col.cellIndex;
  }

  if(rowIndex != -1 && colIndex != -1) {
    var final_row = rowIndex + row_offset;
    var table = matching_row.parentNode;

    if(table && table.nodeName == "TBODY" &&
         final_row >= 0 && final_row < table.rows.length) {
      var row = table.rows[final_row];
      var final_col = colIndex + col_offset;

      if(row && final_col >= 0 && final_col < row.cells.length) {
        var col = row.cells[final_col];
        return col;
      }
    }	
  } else {
  	return null;
  }

  return null;
}

// Focusable elements can be matched by the tag names shown here.
var fucusableElementRegExp = /^A|SELECT|TEXTAREA|BUTTON|INPUT/;

// Matches focusable elements.
function matchByFocusFunc(elem) {
  if(elem && elem.nodeType == 1)  {
    var tindex = elem.getAttribute('tabindex');
    if((tindex && tindex > 0) || (elem.tabIndex && elem.tabIndex > 0)) {
      // Return false because this should be handled by the tabindex extension.
      WA.Utils.log("Returning false because tindex=" + tindex);
      return false;
    } else if(fucusableElementRegExp.test(elem.nodeName) || ((tindex && tindex == 0) || (elem.tabIndex && elem.tabIndex == 0))) {
      if(elem.tagName == "INPUT") {
        var input_type = elem.getAttribute('type');
        if(input_type && /hidden/i.test(input_type)) {
          return false;
        }
      }
      
      return true;
    }
  }
  return false;
}

// Matches readable (non-empty) elements.
function nonEmptyMatchFunc() {
  var func = function(elem) {
    if(WA.Nodes.leafElement(elem)) {
      var text = WA.Nodes.handleNode(elem, true);
      if(/\S/.test(text)) {
	return true;
      }
    }
    return false;
  };
  return func;
}

// Matches elements matching the supplied text, used for find functionality.
// context:  text to be matched.
function contentMatchFunc(context) {
  var func = function(elem) {
    if(WA.Nodes.leafElement(elem)) {
      var text = WA.Nodes.handleNode(elem, true);
      var reg = new RegExp(context, "i");

      WA.Utils.log("comparing: " + context + " to " + text);

      if(reg.test(text)) {
        return true;
      }
    }

    return false;
  };

  return func;
}

/**
 * Matches elements that would produce speech if read.
 * @return Function that matches nodes by whether or not they speak.
 */
function matchBySpeaksFunc() {
  var func = function(elem) {
    var text = WA.Nodes.handleNode(elem, true);
    if(text && text != "") {
      return true;
    }

    return false;
  };

  return func;
}

function nextBySpeaks(node) {
  var matcher = matchBySpeaksFunc();
  return _nextNodeByMatcher(matcher, node);
}

function nextByFocus(node) {
  var matcher = matchByFocus();
  return _nextNodeByMatcher(matcher, node);
}

function nextByTag(node, tag) {
  var matcher = matchByTag(tag, null);
  return _nextNodeByMatcher(matcher, node);
}

function nextNonEmpty() {
  var matcher = nonEmptyMatchFunc();
  return nextNodeByMatcher(matcher, "");  
}

function getFinderValue() {
  var find_text = getFinderBox();
  var find_val = find_text.value;

  return find_val;
}

function getFinderBox() {
  var nav_doc = getNavigationDocument();
  var find_text = nav_doc.getElementById('wa_finder_field');

  return find_text;
}


/**
 * Next node content finder, handler for "Find Next" button click.
 */
function nextNodeContentFinder() {
  var find_val = getFinderValue();

  var result = nextNodeContentFind(find_val);

  if(result) {
    setBrowseMode(WA.PLAY_ONE);
  } else {
    setBrowseMode(WA.KEYBOARD);
  }
}

/**
 * Previous node content finder, handler for "Find Previous" button click.
 */
function prevNodeContentFinder() {
  var find_val = getFinderValue();

  var result = prevNodeContentFind(find_val);

  if(result) {
    setBrowseMode(WA.PLAY_ONE);
  } else {
    setBrowseMode(WA.KEYBOARD);
  }
}

/**
 * Finds the next node matching the supplied context with respect to
 * the currentNode.
 * @param context Text string to match.
 * @return Boolean Was something found?
 */
function nextNodeContentFind(context) {
  var matcher = contentMatchFunc(context);
  return nextNodeByMatcher(matcher, "phrase found");
}

/**
 * Finds the previous node matching the supplied context with respect to
 * the currentNode.
 * @param context Text string to match.
 * @return Boolean Was something found?
 */
function prevNodeContentFind(context) {
  var matcher = contentMatchFunc(context);
  return prevNodeByMatcher(matcher, "phrase found");
}

/**
 * Goes to the next node with the given tagName and optional attribute.
 * @param tag  Regular expression that matches the nodeName
 *             of the appropriate type.
 * @param attrib  An option attribute that needs to be present
 *                in order for a node to match
 * @return Node Next node matching tag and attribute.
 **/
function nextNodeTagAttrib(tag, attrib) { 
  var matcher = matchByTag(tag, attrib);
  
  // Switches on the known regular expression patterns.
  switch(tag.toUpperCase()) {
    case "H":
      description = "headings"; break;
    case "TR":
      description = "table rows"; break;
    case "INPUT|SELECT|BUTTON":
      description = "input elements"; break;
    case "TABLE":
      description = "tables"; break;
    case "P":
      description = "paragraphs"; break;
    default:
      description = "results"; break;
  }

  return nextNodeByMatcher(matcher, description);
}

/**
 * Returns the match by focus function.
 * @return matchByFocusFunc
 */
function matchByFocus() {
  return matchByFocusFunc;
}

/** Goes to the next node that is focusable.
 * Used to simulate TAB key press.
 * @return nextNodeByMatcher
 */
function nextNodeFocus() {	
	//if(typeof WA.Extensions.TabIndexExtension.getNextNode != 'undefined') {
    WA.Utils.log('checking tabindex');
    var next = tabIndexExt.getNextNode();
    WA.Utils.log('next: ' + next);
    if(next != null) {
    	WA.Utils.log('next: ' + next.innerHTML);
    	tabIndexExt.recordTabIndex(next);
      setCurrentNode(next, true);
    	return true;
    }
  //}
  WA.Utils.log('NORMAL FOCUS');

  var matcher = matchByFocus();
  return nextNodeByMatcher(matcher, "");
}

/**
 * Finds the next node that matches the supplied 'matcher' function.
 * @param matcher
 * @param node
 * @return The next node.
 */
function _nextNodeByMatcher(matcher, node) {
  var last_result = null;
  var result = node;

  // Some ugliness to handle Javascript recursion limits, which
  // could otherwise cause the method to fail on large web pages.
  do {
    last_result = result;
  } while(last_result != result && !matcher(result));
  return result;
}

/**
 * Function takes as input
 * @param matcher Function which takes as input a DOM element and returns true
 * if it matches and false otherwise.
 * @param description String that describes the type of element
 * being looked for, which is used to describe to users what was found.
 */
function nextNodeByMatcher(matcher, description) {
  if(WA.browseMode == WA.PAUSED) {
    return false;
  } else if(!currentNode) {
    if(!currentDoc) {
      currentDoc = getContentDocument();
    }
    if(currentDoc) {
      setCurrentNode(currentDoc.body);
    }
    if(!currentNode) {
      return false;
    }
  }

  WA.Utils.log('current node is: ' + currentNode + "\n");

  var result = _nextNodeByMatcher(matcher, currentNode);

  if(result) {
    var result_id = "";
    if(result.getAttribute) {
      result_id = result.getAttribute('id');
    }
    if(result_id == 'always_last_node' && description != "") {
      return false;
    } else {
      visit(result, true);
      setCurrentNode(result, true);
      return true;
    }
  } else if(description != "") {
    return false;
  }
}

/**
 * Goes to the next node with the given tagName and optional attribute
 * @param tag Tag to look for.
 * @param attrib Attribute to loook for.
 * @return Node with matching tag and attrib.
 */
function prevNodeTagAttrib(tag, attrib) { 
  var matcher = matchByTag(tag, attrib);
  return prevNodeByMatcher(matcher);
}

/**
 * Goes to the next node with the given tagName and optional attribute
 * @return Node that was found.
 */
function prevNodeFocus() { 
  var middle = tabIndexExt.inMiddle();

  if(!middle) {
	  var matcher = matchByFocus();
	  var prevresult = prevNodeByMatcher(matcher);
	
	  if(prevresult && getScriptWindow().currentNode != getFirstContent()) {
	    return true;
	  }
  }

  WA.Utils.log('checking ptabindex');
  var prev = tabIndexExt.getPrevNode();
  if(prev != null) {
    WA.Utils.log('prev: ' + prev.innerHTML);
    tabIndexExt.recordTabIndex(prev);
    setCurrentNode(prev, true);
    return true;
  }

  return prevresult;
}

/**
 * Maches the previous node that matches the function matcher.
 * @param matcher Function used as a matcher.
 * @return Element found.
 */
function prevNodeByMatcher(matcher) {
  if(WA.browseMode == WA.PAUSED) {
    return null;
  } else if(!currentNode) {
    if(!currentDoc) {
      currentDoc = getContentDocument();
    }
    if(currentDoc) {
      setCurrentNode(currentDoc.body);
    }
    if(!currentNode) {
      return null;
    }
  }

  var result = null;
  var last_result = null;

  do {
    last_result = result;
  } while(last_result != result && !matcher(result));
  
  if(result) {
    visit(result, true);
    setCurrentNode(result);
  }

  return result;
}

/**
 * Boolean: Does the parent node match the given matcher function?
 * @param node DOMElement to check.
 * @param matcher Boolean matcher function to check with.
 */
function parentMatches(node, matcher) {
  return matcher(node.parentNode);
}


/**
 * Returns true if the node is an element with the given tag name and 
 * attribute (optional).
 * @param tag  Regular expression to be applied to tag names.
 * @param node  Node to be tested.
 * @param attrib  Attribute node is required to have to pass test.
 */
function isTagAttribute(node, tag, attrib) {
  if(!node || !node.tagName) {
    return false;
  }

  var tagmatch = new RegExp("^" + tag, "i");

  if(attrib) {
    return (node.nodeType == 1 && tagmatch.test(node.tagName) && WA.Nodes.hasAttribute(node, attrib));
  } else {
    return (node.nodeType == 1 && tagmatch.test(node.tagName));
  }
}

//----------------------- END ADVANCE TO TAG ---------------------

/**
 * nextNode
 * Advance to the next node.
 */
function nextNode() {
	//var _currNode = currentNode;
  var next_node_info = _nextNode();
  var next_node = next_node_info[0];
  var node_text = next_node_info[1];

  if(next_node && node_text) {
    lastNode = next_node;

    setCurrentChar(node_text.length);
    if(WA.browseMode == WA.PLAY_ONE) {
      setBrowseMode(WA.KEYBOARD);
    }
  }
}

/**
 * Support for advancing to the next node.
 */
function _nextNode() {
  var spoken_node = null; // The node that is advanced to.
  var node_text = null;

  if(WA.browseMode == WA.PAUSED) {
    return [null, null];
  } else if(!currentNode) {
    if(!currentDoc) {
      currentDoc = getContentDocument();
    }
    if(currentDoc) {
      setCurrentNode(currentDoc.body);
    }
    if(!currentNode) {
      return [null, null];
    }
  }

  // Retrieve the text that will be spoken for this node.
  node_text = WA.Nodes.handleNode(currentNode, true);
  if(node_text) {
    spoken_node = currentNode;
  }

  // Visit the current node.
  visit(currentNode, (spoken_node != null));

  if(currentNode.firstChild && !WA.Nodes.leafNode(currentNode)) {
    setCurrentNode(dfsNode(currentNode));
  } else if(currentNode.nextSibling) {
    setCurrentNode(currentNode.nextSibling);
  } else if(currentNode.nodeName == "BODY") {
    setCurrentNode(currentNode.firstChild);
  } else if(currentNode.nodeName == "IFRAME") {
    //WA.Utils.log("In _nextNode. currentNode.nodeName is: "+currentNode.nodeName+"  currentNode.contentDocument.body is: "+currentNode.contentDocument.body);
    // Push this iframe node onto the _iframeNodes stack so that we can 
    // navigate back to this iframe when we are done with it.
    WA.Nodes._iframeNodes.push(currentNode);
    WA.Utils.log("_iframeNodes is "+WA.Nodes._iframeNodes.length+" nodes long.");
    // If IE, use currentNode.document.body, otherwise currentNode.contentDocument.body
    if(currentNode.contentDocument) 
    // Firefox, Opera
    {
      setCurrentNode(dfsNode(currentNode.contentDocument.body)); 
    }
    else if(currentNode.contentWindow)
    // Internet Explorer
    {
      setCurrentNode(dfsNode(currentNode.contentWindow.document.body));
    }
    else if(currentNode.document)
    // Others?
    {
      setCurrentNode(dfsNode(currentNode.document.body));
    }
    
  } else {
    goBackUp();
  }
  
  return [spoken_node, node_text];
}

/**
 * Move back up the DFS tree.
 */
function goBackUp() {
  var oldCurrent = currentNode;

  while(currentNode.parentNode) {
    setCurrentNode( currentNode.parentNode );
    if(currentNode.nextSibling) {
      setCurrentNode(currentNode.nextSibling);
      break;
    }
    if(currentNode.nodeName == "BODY") { 
      if(currentDoc.body == currentNode) { // At the last node.
		  setBrowseMode(WA.KEYBOARD);
		  var end_node = null;
		  if(currentDoc) {
			end_node = currentDoc.getElementById('always_last_node');
		  } else {
			end_node = oldCurrent;
		  }
		  setCurrentNode(end_node);
		  break;
		} else { // At the end of an iframe.
		    WA.Utils.log("In goBackUp, about to pop node from _iframeNodes.");
		    var iframeNode = WA.Nodes._iframeNodes.pop();
		    if (iframeNode.nextSibling) { 
		      setCurrentNode(iframeNode.nextSibling);
		      } else {
		        setCurrentNode(iframeNode.parentNode.nextSibling);
		      }
		    break;
		}
    }
  }
}

/**
 * Sets the global browseMode.
 * @param browseMode
 **/
function setBrowseMode(browseMode) {
  if(WA.browseMode == WA.PLAY_ONE || WA.browseMode == WA.READ) {
    WA.lastBrowseModeDirection = WA.FORWARD;
  } else if(WA.browseMode == WA.PLAY_ONE_BACKWARD ||
              WA.browseMode == WA.PLAY_TWO_BACKWARD ||
              WA.browseMode == WA.PREV_CHAR) {
  	WA.lastBrowseModeDirection = WA.BACKWARD;
  }

  WA.browseMode = browseMode;
}

/**
 * Navigate to the previous node in the document.
 */
function prevNode() {
  var node_text = WA.Nodes.handleNode(currentNode, true);
  var spoken = (node_text != null && String(node_text).length > 0);

  visit(currentNode, spoken);

  if(node_text) {
    setCurrentChar(node_text.length);
    if(WA.browseMode == WA.PREV_CHAR) {
      setBrowseMode(WA.KEYBOARD);
      prevChar();
      return;
    } else if(WA.browseMode == WA.PREV_CHAR_BACKONE) {
      setBrowseMode(WA.PREV_CHAR);
    } else if(WA.browseMode != WA.PAUSED) {

      // Update for the next play.
      if(WA.browseMode == WA.PLAY_ONE_BACKWARD) {
        setBrowseMode(WA.KEYBOARD);
      }
    }
  }  

  if(currentNode.tagName == "BODY") {
    // If this is the BODY of an iframe element, set the currentNode
    // to the iframe element in the parent window/DOM
    if(WA.Nodes._iframeNodes.length > 0) {
        setCurrentNode(WA.Nodes._iframeNodes.pop());
    } else {
        setBrowseMode(WA.KEYBOARD);
    }
  } else if(currentNode.previousSibling) {
    setCurrentNode(currentNode.previousSibling);
    setCurrentNode(rdfsNode(currentNode));
  } else {
    setCurrentNode(currentNode.parentNode);
  }
}

/**
 * Reverse depth-first search from the node supplied.
 * @param node Node where the reverse DFS should start.
 */
function rdfsNode(node) {
  while(node && node.nodeType == 1 && node.lastChild && !WA.Nodes.leafNode(node)) {
    if(node.tagName == "SCRIPT" || node.tagName == "STYLE") {
      break;
    }

    visit(node, false);

    node = node.lastChild;
  }
  return node;
}

/**
 * Depth-first search from the supplied node.
 * @param node Node where the DFS shoudl start.
 */
function dfsNode(node) {
  visit(node, false);

  if(WA.Nodes.leafNode(node)) {
    return node;
  } else {
    return node.firstChild;
  }
}

/**
 * Processes the supplied element when it becomes the current focus
 * of reading.
 * @param elem Element that has been visited.
 * @param is_spoken Is the visit to a spoken node?
 */
function visit(elem, is_spoken) {
  if(is_spoken) {
    WA.Extensions.spotlightNode(elem);
    lastNodePlayed = elem;
  }

  // Blur the last focused element.
  if(lastFocused != null) {
    lastFocused.blur();
  }

  // Focus the element if it can be focused.
  if(WA.Nodes.isFocusable(elem)) {
    focusNode(elem);
  }
}

/**
 * Counts the number of links that have an href, indicating that they're
 * a link and not just an anchor.
 * @param doc Document on which links should be calculated.
 * @return cnt Count of the links in the document.
 */
function countNumLinks(doc) {
  var cnt = 0;
  var elems = doc.getElementsByTagName('A');
  for(i=elems.length-1; i>=0; i--) {
    if(WA.Nodes.hasAttribute(elems[i], 'href')) {
      cnt++;
    }
  }
  return cnt;
}

/**
 * Counts the number of heading elements on the supplied document.
 * @param doc Document on which the number of headings should be counted.
 * @return cnt Count of the headings in the document.
 */
function countNumHeadings() {
  var cnt = 0;
  for(i=0; i<nDocuments.length; i++) {
      cnt += nDocuments[i].getElementsByTagName('H1').length;
	  cnt += nDocuments[i].getElementsByTagName('H2').length;
	  cnt += nDocuments[i].getElementsByTagName('H3').length;
	  cnt += nDocuments[i].getElementsByTagName('H4').length;
	  cnt += nDocuments[i].getElementsByTagName('H5').length;
	  cnt += nDocuments[i].getElementsByTagName('H6').length;
  }
  return cnt;
}

/**
  * Populate the nDocuments array with all existing Document objects.
  * At the moment, this is only testing for Document objects associated
  * with iframe nodes. May need to broaden this to frames and ??
  *
  * @param docObject - A Document object to be traversed.
  *
  */
  function buildDocumentStack(docObject) {
    var iFrames = docObject.getElementsByTagName("IFRAME");
    if(iFrames) {
      for(var i=0; i<iFrames.length; i++) {
         if(iFrames[i].contentDocument) 
         // Firefox, Opera
         {
            nDocuments.push(iFrames[i].contentDocument);
            buildDocumentStack(iFrames[i].contentDocument);
         }
         else if(iFrames[i].contentWindow)
         // Internet Explorer
         {
            nDocuments.push(iFrames[i].contentWindow.document);
            buildDocumentStack(iFrames[i].contentWindow.document);
         }
         else 
         // Others?
         {
           nDocuments.push(iFrames[i].document);
           buildDocumentStack(iFrames[i].document);
         }  
        
        // what happens if new iframes are inserted after the fact?
        if(iFrames[i].attachEvent) {
          iFrames[i].contentWindow.document.attachEvent('onkeydown', handleKeyDown);
        }
        else if(iFrames[i].addEventListener) 
        {
          iFrames[i].contentDocument.addEventListener('keydown', handleKeyDown, false);
        }
  
        if(iFrames[i].attachEvent) iFrames[i].contentWindow.document.attachEvent('onkeyup', handleKeyUp);
        else if(iFrames[i].addEventListener) iFrames[i].contentDocument.addEventListener('keyup', handleKeyUp, false);
  
        if(iFrames[i].attachEvent) iFrames[i].contentWindow.document.attachEvent('onkeypress', handleKeyPress);
        else if(iFrames[i].addEventListener) iFrames[i].contentDocument.addEventListener('keypress', handleKeyPress, false);
       
      }
    }
    WA.Utils.log("Leaving buildDocumentStack. nDocuments.length is: "+nDocuments.length);
  } 

/**
 * Focus the supplied node if possible.
 * @param node Node to be focused.
 */
function focusNode(node) {
  if(focusedNode != node) { 
    programmaticFocus = true;
    if(lastFocused != null)
      lastFocused.blur();
    WA.Utils.log('blurring ' + lastFocused);

    try {
      node.focus();
      if(node.select) {
        node.select();
      }
      lastFocused = node;
    } catch(e) {}
  }
}
