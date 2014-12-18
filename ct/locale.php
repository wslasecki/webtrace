<?php
function wa_gettext($text) {
    return $text;
}

echo "<script type='text/javascript'>function wa_gettext(text) { return text; }</script>";

// set home page
if (empty($default_content_url)) {
  if (array_key_exists($locale, $home_pages)) {
    $default_content_url = $home_pages[$locale];
  } else if (array_key_exists($locale1, $home_pages)) {
    $default_content_url = $home_pages[$locale1];
  } else if (array_key_exists('en', $home_pages)) {
    $default_content_url = $home_pages['en'];
  } else {
    $default_content_url = '';
  }
}

?>
