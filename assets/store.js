/* Flip-ready, platform-aware store links for Jocundo game pages.
 *
 * Pre-launch, this does nothing: every game shows its "coming soon" pills. When a
 * game ships, add its store URLs to STORES below (keyed by the page slug, e.g.
 * "tumbledown", "reef-runner"). That page's pills are then replaced with a live
 * download button that routes iOS visitors to the App Store, Android visitors to
 * Google Play, and desktop visitors to both. One config line per game, no page edits.
 *
 * This is what the in-game "Dare a friend" card and the web score-share link point
 * at (jocundo.com/games/<slug>.html), so the moment a game is live, every shared
 * score becomes a working download link.
 */
(function () {
  "use strict";

  var STORES = {
    // "tumbledown": {
    //   ios:     "https://apps.apple.com/app/idXXXXXXXXX",
    //   android: "https://play.google.com/store/apps/details?id=com.jocundo.tumbledown"
    // },
  };

  function pageSlug() {
    var m = location.pathname.match(/\/games\/([a-z0-9-]+)\.html/i);
    return m ? m[1].toLowerCase() : "";
  }

  var s = STORES[pageSlug()];
  if (!s || (!s.ios && !s.android)) return; // no live links yet: leave "coming soon"

  var box = document.querySelector(".soon .stores");
  if (!box) return;

  var ua = navigator.userAgent || "";
  var isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);

  var style = document.createElement("style");
  style.textContent =
    ".soon .stores{gap:.8rem}" +
    ".storebtn{font-family:var(--display,inherit);font-weight:600;font-size:var(--step0,1.1rem);" +
    "color:#fff;background:var(--coral,#E85A50);padding:.85rem 1.6rem;border-radius:999px;" +
    "display:inline-flex;align-items:center;gap:.55rem;box-shadow:0 12px 26px -10px rgba(201,70,61,.6);" +
    "transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s}" +
    ".storebtn:hover{text-decoration:none;transform:translateY(-3px);" +
    "box-shadow:0 18px 32px -10px rgba(201,70,61,.7)}" +
    ".storebtn.secondary{background:var(--surface,#fff);color:var(--ink,#241E33);" +
    "border:1px solid rgba(36,30,51,.14);box-shadow:none}";
  document.head.appendChild(style);

  function button(kind, url, primary) {
    if (!url) return "";
    var label = kind === "ios" ? "App Store" : "Google Play";
    return '<a class="storebtn' + (primary ? "" : " secondary") + '" href="' + url +
      '" rel="noopener">Get it on ' + label + "</a>";
  }

  var html;
  if (isAndroid) html = button("android", s.android, true) + button("ios", s.ios, false);
  else if (isIOS) html = button("ios", s.ios, true) + button("android", s.android, false);
  else html = button("ios", s.ios, true) + button("android", s.android, true);
  box.innerHTML = html;

  var h = document.querySelector(".soon h2");
  if (h) h.textContent = "Get it now, free.";
  var p = document.querySelector(".soon p");
  if (p) p.textContent = "One tap and you are playing. Then dare a friend to beat your score.";
})();
