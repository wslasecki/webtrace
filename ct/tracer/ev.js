
$(document).ready( function() {

  console.log("On it, Chief.");

  $('#content_frame').load( function() {
    $('#content_frame').contents().click( function() {
      alert("CLICKED");
    });
  });

});
