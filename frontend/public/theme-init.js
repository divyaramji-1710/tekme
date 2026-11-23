// Runs before first paint: apply the saved (or system) theme so there is no flash of the wrong theme.
(function () {
  var s = {};
  try { s = JSON.parse(localStorage.getItem("tekme:settings") || "{}") || {}; } catch (e) { s = {}; }
  var q = null; try { q = new URLSearchParams(location.search).get("theme"); } catch (e) { q = null; }
  var pref = (q === "dark" || q === "light") ? q : (s.theme || "system");
  var dark = pref === "dark" || (pref === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  var r = document.documentElement;
  r.setAttribute("data-theme", dark ? "dark" : "light");
  r.setAttribute("data-motion", s.motion || "system");
  if (s.textScale) r.style.setProperty("--text-scale", String(s.textScale / 100));
})();
