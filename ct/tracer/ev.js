var prevPage = null;
var curPage = $('#location').val();

$(document).ready( function() {

  console.log("On it, Chief.");
  loadInit();


});

//$('#content_frame').load( function() {
function loadInit() {
  // Handle input events
  $('#content_frame').contents().find('input').click( function(ev) {
    processInputEv(ev);
  });
  $('#content_frame').contents().find('input').keydown( function(ev) {
    processInputEv(ev);
  });
  $('#content_frame').contents().find('button').click( function(ev) {
    processInputEv(ev);
  });

  // Handle focus change events
  // TODO.

  // Handle page loads
  $('#content_frame').bind('beforeunload', function() {
    processPageUnloadEv();
  });
  $('#content_frame').on('load', function() {
    processPageLoadEv();
  });

}


// Helper functions
function processInputEv(e) {
  console.log("INPUT event caught!");

  // Find the currently active element in the iframe
  var activeElem = $($('#content_frame').contents()[0].activeElement);
  if( activeElem.val() != '' ) {
    // Log the new value
  }


}

function processPageLoadEv() {
  //alert("LOADED!");
  prevPage = curPage;
  curPage = $('#content_frame').contents()[0].location.href;
  console.log("Page changed from: " + prevPage + " --> " + curPage);
}
function processPageUnloadEv() {
  alert("UNLOAD!!");
}
