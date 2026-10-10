/* =========================================================
   VILLA.HTML — PAGE-SPECIFIC SCRIPT

   Only runs on villa.html. Never touches script.js or any
   element outside this page.

   Two independent pieces:
   1. Hero scroll-controlled video scrub (plain JS, per spec —
      no animation library needed for this part).
   2. Below-the-hero section reveals (GSAP + ScrollTrigger,
      same CDN/version/easing conventions as script.js, since
      that's the animation library this site already uses).
========================================================= */


/* =========================================================
   CONSTANTS — edit these

   HERO_VIDEO_SRC / HERO_POSTER_SRC: also update the matching
   src/poster attributes in villa.html. This constant is
   re-applied to the <source> on load, so in practice editing
   just this one line is enough even if the HTML isn't touched.
========================================================= */

const HERO_VIDEO_SRC = "assets/hero-scrub.mp4";
const HERO_POSTER_SRC = "assets/hero-poster.jpg";

// Lerp factor: how fast the smoothed progress catches up to the
// real scroll-derived target each frame. Higher = snappier/less
// smoothing, lower = floatier. Spec range: 0.08–0.12.
const LERP_FACTOR = 0.1;

// Skip re-seeking the video when the smoothed progress has moved
// less than this since the last seek — avoids spamming
// currentTime on sub-pixel scroll jitter.
const SEEK_THRESHOLD = 0.0015;

// Progress windows (0–1) the two text overlays animate across.
const INTRO_FADE_END = 0.2;
const SCROLL_INDICATOR_FADE_END = 0.08;
const CLOSING_FADE_START = 0.85;


const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;


/* =========================================================
   HERO ELEMENTS
========================================================= */

const heroWrapper = document.getElementById("villa-hero-wrapper");
const heroVideo = document.getElementById("villa-hero-video");
const heroIntro = document.getElementById("villa-hero-intro");
const heroClosing = document.getElementById("villa-hero-closing");
const scrollIndicator = document.getElementById("villa-scroll-indicator");

if (heroWrapper && heroVideo) {

  heroVideo.poster = HERO_POSTER_SRC;

  const sourceEl = heroVideo.querySelector("source");
  if (sourceEl) sourceEl.src = HERO_VIDEO_SRC;

  // A missing video file fires "error" rather than throwing — this
  // listener just keeps that from being silently mysterious. The
  // stage already has a dark CSS background, so there's nothing
  // further to do for the "page must still load" requirement.
  heroVideo.addEventListener("error", () => {
    console.warn(
      `villa hero video "${HERO_VIDEO_SRC}" failed to load — showing fallback background.`
    );
  });


  /* =======================================================
     REDUCED MOTION PATH

     Show the first frame, skip the scrub loop entirely. The
     intro overlay's final visible state and the closing
     overlay's hidden state are both handled by the
     prefers-reduced-motion block in style2.css, so there's
     nothing further to drive here — just park the video.

     (Showing the closing overlay at the same time as the intro
     would mean two overlapping text blocks in the same space
     with no scroll-driven way to tell them apart, which is worse
     for comprehension than simply not showing the secondary
     closing flourish — the essential hero content, the intro
     block, stays fully visible and reachable without scrolling.)
  ======================================================= */

  if (prefersReducedMotion) {

    // HAVE_METADATA (readyState 1) may already be true by the time
    // this runs — script2.js executes after the GSAP CDN <script>
    // tags, which can take longer to fetch than a local video takes
    // to report its metadata, so the "loadedmetadata" event can
    // already have fired before any listener attaches. Check the
    // current state first and only fall back to the event.
    if (heroVideo.readyState >= 1) {
      heroVideo.currentTime = 0;
    } else {
      heroVideo.addEventListener(
        "loadedmetadata",
        () => {
          heroVideo.currentTime = 0;
        },
        { once: true }
      );
    }

  } else {

    /* =====================================================
       NORMAL PATH — SCROLL-DRIVEN SCRUB
    ===================================================== */

    let videoDuration = 0;
    let videoReady = false;

    function markVideoReady() {
      videoDuration = heroVideo.duration || 0;
      videoReady = videoDuration > 0;
    }

    // Same race as above: don't rely solely on the event firing
    // after this point — the video may have already reached
    // HAVE_METADATA by the time script2.js runs.
    if (heroVideo.readyState >= 1) {
      markVideoReady();
    } else {
      heroVideo.addEventListener("loadedmetadata", markVideoReady, {
        once: true
      });
    }

    function clamp01(value) {
      return Math.min(1, Math.max(0, value));
    }

    // Eased 0→1 curve for the overlay fades/slides below, so they
    // don't move at a flat linear rate — matches the "eased, not
    // linear" feel of the power*-eased GSAP tweens elsewhere on
    // the site, without needing GSAP in this per-frame hot path.
    function smoothstep(t) {
      return t * t * (3 - 2 * t);
    }

    function getTargetProgress() {

      const rect = heroWrapper.getBoundingClientRect();
      const scrollable = heroWrapper.offsetHeight - window.innerHeight;

      if (scrollable <= 0) return 0;

      const scrolled = -rect.top;

      return clamp01(scrolled / scrollable);

    }

    let currentProgress = 0;
    let lastSeekedProgress = -1;

    function applyOverlayStyles(progress) {

      // Intro: full at 0, fades + slides up by INTRO_FADE_END.
      const introT = smoothstep(clamp01(progress / INTRO_FADE_END));
      const introOpacity = 1 - introT;
      heroIntro.style.opacity = introOpacity;
      heroIntro.style.transform = `translateY(calc(-50% - ${introT * 40}px))`;
      heroIntro.style.pointerEvents = introOpacity > 0.05 ? "auto" : "none";

      // Scroll indicator: fades out fast, right as scrolling starts.
      const indicatorT = smoothstep(
        clamp01(progress / SCROLL_INDICATOR_FADE_END)
      );
      scrollIndicator.style.opacity = 1 - indicatorT;

      // Closing: hidden until CLOSING_FADE_START, fades + slides in.
      const closingT = smoothstep(
        clamp01((progress - CLOSING_FADE_START) / (1 - CLOSING_FADE_START))
      );
      heroClosing.style.opacity = closingT;
      heroClosing.style.transform = `translateY(${(1 - closingT) * 30}px)`;
      heroClosing.style.pointerEvents = closingT > 0.05 ? "auto" : "none";

    }

    // Initial state (before any scroll / before the loop starts).
    applyOverlayStyles(0);

    let rafId = null;

    function tick() {

      const targetProgress = getTargetProgress();

      currentProgress += (targetProgress - currentProgress) * LERP_FACTOR;

      applyOverlayStyles(currentProgress);

      if (
        videoReady &&
        Math.abs(currentProgress - lastSeekedProgress) > SEEK_THRESHOLD
      ) {

        // iOS/mobile note: seeking h264 video is only as smooth as
        // the nearest keyframe — a long-GOP encode (the default for
        // most exports) can feel janky when scrubbed frequently.
        // The lerp smoothing above plus this threshold already cut
        // down how often we seek; for genuinely smooth scrubbing,
        // re-encode with every frame as a keyframe (see Step 5 /
        // the ffmpeg command reported alongside this change) and
        // point HERO_VIDEO_SRC at that file.
        heroVideo.currentTime = currentProgress * videoDuration;
        lastSeekedProgress = currentProgress;

      }

      rafId = requestAnimationFrame(tick);

    }

    function startLoop() {
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    // Only run the loop while the hero is actually in view.
    if ("IntersectionObserver" in window) {

      const heroVisibilityObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              startLoop();
            } else {
              stopLoop();
            }
          });
        },
        { rootMargin: "20% 0px" }
      );

      heroVisibilityObserver.observe(heroWrapper);

    } else {

      startLoop();

    }

  }

}


/* =========================================================
   GSAP SETUP (below the hero)

   Plugin registration + config shared by every scene below —
   the #villa-about/#villa-featured/#villa-contact placeholder
   sections that used to be revealed from right here (and the
   .villa-section-inner content they held) have been removed
   from villa.html entirely, so there's nothing left to animate
   at this point in the file; every actual scene wires itself up
   independently further down (registerScene/initStory).
========================================================= */

if (window.gsap && window.ScrollTrigger && window.SplitText) {

  gsap.registerPlugin(ScrollTrigger, SplitText);

  // ScrollToPlugin is only needed for #scene-journey's "Start
  // exploring" button — registered separately (not added to the
  // gate above) so a CDN hiccup on just this plugin doesn't take
  // down every other scene's ScrollTrigger-driven animation.
  if (window.ScrollToPlugin) gsap.registerPlugin(ScrollToPlugin);

  gsap.config({ force3D: true });

  // Without this, ScrollTrigger treats a mobile browser's address
  // bar hiding/showing mid-scroll (a height-only viewport change)
  // the same as a real resize and auto-refreshes every trigger —
  // this covers ScrollTrigger's own internal resize listener;
  // the width-only guard just below covers this file's own.
  ScrollTrigger.config({ ignoreMobileResize: true });

  // General-purpose refresh-on-real-resize for every scene in
  // this file: #scene-journey has its own width-gated resize
  // listener (it needs a full rebuild, not just a refresh, since
  // its tween positions are baked from live pixel measurements),
  // but that one only ever runs inside its own desktop() branch —
  // on mobile, under reduced motion, or for any other scene
  // (scene-intro/scene-amenities/#finale), nothing else calls
  // ScrollTrigger.refresh() on resize without this, leaving their
  // start/end positions stale after a real width change (e.g. a
  // tablet rotating, or a desktop window being resized) reflows
  // the page. Width-only, not height: mobile browsers fire
  // "resize" when their address bar collapses/expands during
  // scroll too, and refreshing on every one of those can shift
  // still-pending reveal triggers for no reason.
  let resizeTimer;
  let lastViewportWidth = window.innerWidth;

  window.addEventListener("resize", () => {

    const currentWidth = window.innerWidth;
    if (currentWidth === lastViewportWidth) return;
    lastViewportWidth = currentWidth;

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 250);

  });

}


/* =========================================================
   SCROLL STORY — SCENE REGISTRY (foundation)

   Each later prompt adds one scene by calling registerScene()
   once, passing its own desktop/mobile init functions — those
   functions are responsible for finding their own section
   (e.g. document.getElementById("scene-intro")) and wiring it
   up. Nothing here needs to change as scenes are added.

   sceneRegistry/registerScene/revealLines are declared at the
   top level (not nested inside the GSAP-availability check
   above) specifically so later code appended anywhere in this
   file can call registerScene(...) unconditionally — defining
   a function or pushing to an array can't fail even if GSAP
   somehow isn't loaded; only *calling* revealLines() needs it,
   and that only happens once a scene's init function actually
   runs, which is itself gated behind the GSAP-availability
   check via initStory() below.
========================================================= */

const sceneRegistry = [];

function registerScene({ desktop, mobile }) {
  sceneRegistry.push({ desktop, mobile });
}

/*
  Sets will-change on a group of elements while a scene's pin is
  actually active (on screen, scrubbing), and clears it back to
  "auto" the moment it isn't — a permanent CSS will-change would
  keep every pinned scene's layers promoted for the whole page
  lifetime, which is the opposite of what the hint is for. Takes
  a NodeList/array (falsy entries filtered out) and the exact
  property list each group needs — only ever transform/opacity/
  clip-path across this file, matching what each scene actually
  animates. Meant to be called from a scene's own scrollTrigger
  onToggle, once per group.
*/
function setWillChange(elements, props, active) {
  const value = active ? props : "auto";
  (elements || []).forEach((el) => {
    if (el) el.style.willChange = value;
  });
}

/*
  Shared "lines mask-reveal" used across scenes for headings/
  copy. `vars` is shallow-merged over the defaults so a scene
  can override duration/stagger/scrollTrigger/etc. without
  redefining the whole call.
*/
function revealLines(el, vars) {

  return SplitText.create(el, {

    type: "lines",

    mask: "lines",

    autoSplit: true,

    onSplit(self) {

      return gsap.from(
        self.lines,
        Object.assign(
          {
            yPercent: 110,
            duration: 1.1,
            ease: "power4.out",
            stagger: 0.09,
            scrollTrigger: {
              trigger: el,
              start: "top 85%",
              once: true
            }
          },
          vars || {}
        )
      );

    }

  });

}

/*
  RULE (for every scene's desktop/mobile init function): plain
  CSS alone must already render a complete, readable, static
  layout for that scene — these init functions only ever ADD
  hidden/animated start states on top of that, via gsap.from()
  or SplitText's mask reveal. Nothing here should make content
  that plain CSS shows disappear outside of a matchMedia context
  (so reduced-motion and any no-JS case stay fully readable).
*/
function initStory() {

  const mm = gsap.matchMedia();

  mm.add(
    "(min-width: 901px) and (prefers-reduced-motion: no-preference)",
    () => {
      sceneRegistry.forEach((scene) => {
        if (scene.desktop) scene.desktop();
      });
    }
  );

  mm.add(
    "(max-width: 900px) and (prefers-reduced-motion: no-preference)",
    () => {
      sceneRegistry.forEach((scene) => {
        if (scene.mobile) scene.mobile();
      });
    }
  );

  return mm;

}

/* =========================================================
   SCROLL STORY — SCENES

   One registerScene() call per scene. Order doesn't matter to
   the registry itself, but initStory() (which actually starts
   everything) is called once, at the very bottom of this file,
   *after* every scene below has registered — gsap.matchMedia's
   callbacks run synchronously against whatever is in
   sceneRegistry at call time, so a scene registered after that
   point would silently never run. Each later prompt should add
   its registerScene() call in this section, above that final
   initStory() call.
========================================================= */

registerScene({

  /* -------------------------------------------------------
     #scene-intro — "Step inside the everyday"

     Pinned, scrubbed timeline (desktop): arches rise from the
     bottom one by one, hold, then exit upward together with
     the headline fading out, ending on "The amenities" label.
  ------------------------------------------------------- */

  desktop() {

    const scene = document.getElementById("scene-intro");
    if (!scene) return;

    const headline = scene.querySelector(".scene-intro-headline");
    const arches = scene.querySelectorAll(".scene-intro-arch");
    const captions = scene.querySelectorAll(".scene-intro-arch figcaption");
    const amenities = scene.querySelector(".scene-intro-amenities");

    // a) Headline reveal — independent of the pinned/scrubbed
    // timeline below, per spec ("on load, not scrubbed").
    if (headline) revealLines(headline);

    // JS-only hidden start state for the amenities label — CSS
    // alone already shows it fully visible (the "plain CSS =
    // complete, readable layout" rule), this is what the rule
    // means by "only JS, inside matchMedia, sets hidden states."
    if (amenities) {
      gsap.set(amenities, { opacity: 0, y: 24, letterSpacing: "0.35em" });
    }

    // Each arch's entrance starts once the previous is ~60%
    // through its own rise — i.e. stagger = 0.6 * duration,
    // which is exactly what GSAP's numeric `stagger` expresses.
    const RISE_DURATION = 0.14;
    const RISE_STAGGER = RISE_DURATION * 0.6;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scene,
        start: "top top",
        end: "+=350%",
        scrub: 1,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onToggle(self) {
          setWillChange(arches, "transform", self.isActive);
          setWillChange([amenities], "transform, opacity", self.isActive);
        }
      }
    });

    tl

      // b) 0% → ~39%: arches rise one after another; captions
      // fade in alongside their own arch. The caption is a
      // child of its .scene-intro-arch figure, so the figure's
      // own yPercent carries the (already-faded-in) caption
      // along for free in phase (d) below — no separate
      // caption movement tween is needed there.
      .from(
        arches,
        {
          yPercent: 130,
          duration: RISE_DURATION,
          ease: "power2.out",
          stagger: RISE_STAGGER
        },
        0
      )
      .from(
        captions,
        {
          opacity: 0,
          duration: RISE_DURATION,
          stagger: RISE_STAGGER
        },
        0
      )

      // c) Hold ~13%: nothing scheduled between ~39% and 52%, so
      // the timeline simply sits at the settled rise state. (Was
      // 55% — trimmed 3 points: measured via Playwright at ~15.8%
      // of the pin with over half the viewport empty between the
      // headline and the arches, just over the ~10-15% guideline
      // for how long a dead hold should run.)

      // d) 52% → 82%: arches (+ their captions) exit upward;
      // headline rises and fades out at the same time.
      .to(
        arches,
        {
          yPercent: -260,
          duration: 0.2,
          ease: "power1.inOut",
          stagger: 0.03
        },
        0.52
      )
      .to(
        headline,
        {
          y: "-12vh",
          opacity: 0,
          duration: 0.3,
          ease: "power2.inOut"
        },
        0.52
      )

      // e) 85% → 100%: "The amenities" label settles in and holds.
      .to(
        amenities,
        {
          opacity: 1,
          y: 0,
          letterSpacing: "0.22em",
          duration: 0.15,
          ease: "power2.out"
        },
        0.85
      );

  },

  /* -------------------------------------------------------
     #scene-intro — mobile

     No pin/scrub: headline reveals, the 2×2 grid fades up as
     it's scrolled to, and "The amenities" label is just a
     static line below — see the mobile CSS for its layout.
  ------------------------------------------------------- */

  mobile() {

    const scene = document.getElementById("scene-intro");
    if (!scene) return;

    const headline = scene.querySelector(".scene-intro-headline");
    const archesRow = scene.querySelector(".scene-intro-arches");
    const arches = scene.querySelectorAll(".scene-intro-arch");

    if (headline) revealLines(headline);

    if (archesRow && arches.length) {
      gsap.from(arches, {
        opacity: 0,
        y: 40,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: archesRow,
          start: "top 85%",
          once: true
        }
      });
    }

  }

});


/* -------------------------------------------------------
   #scene-amenities — "Twelve ways to spend a day"

   Desktop: a pinned, scrubbed timeline. After a short
   entrance, five list rows take turns being "active" — each
   transition wipes the next stacked image in from the bottom
   (clip-path) while the previous one fades, and moves the
   row highlight across at the same time.
------------------------------------------------------- */

registerScene({

  desktop() {

    const scene = document.getElementById("scene-amenities");
    if (!scene) return;

    const headline = scene.querySelector(".scene-amenities-headline");
    const panel = scene.querySelector(".scene-amenities-panel");
    const images = scene.querySelectorAll(
      ".scene-amenities-panel .scene-amenities-image"
    );
    const rows = scene.querySelectorAll(
      ".scene-amenities-list .scene-amenities-row"
    );

    if (headline) revealLines(headline);

    if (!panel || images.length < 2 || images.length !== rows.length) return;

    // JS-only hidden start state for the panel's entrance — CSS
    // alone already shows it at full size/opacity (item 1's
    // image already visible, the rest pre-clipped — see the CSS
    // comment above .scene-amenities for why that's the correct
    // "complete, readable" rest state for a stacked-image panel).
    gsap.set(panel, {
      scale: 0.55,
      transformOrigin: "left bottom",
      opacity: 0
    });

    // Every OTHER image gets its clip-path as an inline style the
    // moment its own .fromTo() below runs, which permanently takes
    // priority over the CSS class either way it's clipped — but
    // image 0 never gets a clip-path tween of its own (it only
    // ever fades via opacity), so without this it was relying on
    // the .is-active CSS rule to stay unclipped. The moment that
    // class gets removed (first transition), it fell back to the
    // base rule's clip-path: inset(100%...) — an instant hidden
    // snap, fully independent of its opacity fade — leaving a gap
    // where neither the outgoing nor incoming image was visible.
    gsap.set(images[0], { clipPath: "inset(0% 0% 0% 0%)" });

    // Explicit, strictly-increasing z-index per image. These are
    // all position:absolute siblings with z-index:auto, which
    // should paint in DOM order (later = on top) — but animating
    // clip-path/opacity/transform across several of them at once
    // promotes each to its own compositing layer at a different
    // time, and this browser doesn't reliably composite those
    // implicit-order layers back in DOM order: testing found the
    // outgoing image still painting above the incoming one well
    // after the incoming image's computed opacity/clip-path said
    // it should be fully visible (confirmed via elementFromPoint,
    // not just computed style — the pixels didn't match the style).
    // An explicit z-index removes the ambiguity entirely.
    images.forEach((img, idx) => gsap.set(img, { zIndex: idx }));

    const ENTRANCE_END = 0.15;
    const STEP = 0.17; // "~17% per item"

    const innerImages = [...images]
      .map((fig) => fig.querySelector("img"))
      .filter(Boolean);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scene,
        start: "top top",
        end: "+=400%",
        scrub: 1,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onToggle(self) {
          setWillChange([panel], "transform, opacity", self.isActive);
          setWillChange(images, "clip-path, opacity", self.isActive);
          setWillChange(innerImages, "transform", self.isActive);
        }
      }
    });

    tl
      .addLabel("item1", 0)

      // Entrance (0 → 15%): panel scales/fades in, rows fade up.
      .to(
        panel,
        { scale: 1, opacity: 1, duration: ENTRANCE_END, ease: "power2.out" },
        0
      )
      .from(
        rows,
        { opacity: 0, y: 20, duration: ENTRANCE_END, stagger: 0.025 },
        0
      );

    // Items 2–5: each a ~17% step wiping its image in while the
    // previous fades, and moving the row highlight across.
    for (let i = 1; i < images.length; i++) {

      const stepStart = ENTRANCE_END + (i - 1) * STEP;
      const incomingImg = images[i].querySelector("img");

      tl.addLabel(`item${i + 1}`, stepStart);

      tl.fromTo(
        images[i],
        { clipPath: "inset(100% 0% 0% 0%)" },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          duration: STEP,
          ease: "power2.inOut",
          // The actual transition is driven by the inline
          // opacity/clipPath styles above (so it stays correct
          // under scrub's mid-tween scrubbing in either
          // direction) — this just keeps .is-active mirroring
          // that for anyone inspecting the DOM, since nothing
          // else in this scene ever moves the class.
          onStart: () => {
            images[i].classList.add("is-active");
            images[i - 1].classList.remove("is-active");
            rows[i].classList.add("is-active");
            rows[i - 1].classList.remove("is-active");
          },
          onReverseComplete: () => {
            images[i].classList.remove("is-active");
            images[i - 1].classList.add("is-active");
            rows[i].classList.remove("is-active");
            rows[i - 1].classList.add("is-active");
          }
        },
        stepStart
      );

      if (incomingImg) {
        tl.fromTo(
          incomingImg,
          { scale: 1.12 },
          { scale: 1, duration: STEP, ease: "power2.inOut" },
          stepStart
        );
      }

      tl.to(
        images[i - 1],
        { opacity: 0, duration: STEP, ease: "power1.inOut" },
        stepStart
      );

      tl.to(rows[i - 1], { opacity: 0.3, duration: STEP }, stepStart);
      tl.to(rows[i], { opacity: 1, duration: STEP }, stepStart);

    }

  },

  /* -------------------------------------------------------
     #scene-amenities — mobile

     No pin/panel: headline reveals, and each row — now a
     self-contained card with its own image — fades up
     individually as it's scrolled to (they're spread down a
     tall column, so each gets its own trigger rather than one
     shared stagger).
  ------------------------------------------------------- */

  mobile() {

    const scene = document.getElementById("scene-amenities");
    if (!scene) return;

    const headline = scene.querySelector(".scene-amenities-headline");
    const rows = scene.querySelectorAll(
      ".scene-amenities-list .scene-amenities-row"
    );

    if (headline) revealLines(headline);

    rows.forEach((row) => {
      gsap.from(row, {
        opacity: 0,
        y: 40,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: row,
          start: "top 85%",
          once: true
        }
      });
    });

  }

});


/* -------------------------------------------------------
   #scene-journey — merged arch (lead) + horizontal gallery

   Desktop: ONE master timeline drives everything — a single
   pinned scrollTrigger (trigger: the section, pin: the
   .journey stage) whose scroll range is introScroll (time for
   the Phase A arch intro, no horizontal motion yet) + D (the
   track's own overflow, consumed by Phase B's horizontal
   drive). The timeline's own duration is normalized to 1, so
   every position/duration below is a FRACTION of that total
   range, not seconds — phaseBStart (computed from introScroll
   and D) is the one dynamic boundary everything else is
   anchored to, recomputed by computeLayout()/build() so a
   real resize (not every scroll frame) rebuilds the whole
   timeline with fresh measurements instead of going stale.

   Per-panel parallax positions are computed from each panel's
   own offsetLeft/offsetWidth against that same D, per the
   brief's formula — deliberately NOT containerAnimation, since
   the horizontal drive already lives inside this one timeline
   rather than as its own independent tween.
------------------------------------------------------- */

// Set by desktop()'s build() below, read by the "Start
// exploring" button's click handler further down — that handler
// is wired up unconditionally (not inside desktop()/mobile()),
// since it also has to work under prefers-reduced-motion, where
// neither of those ever runs.
let journeyTimeline = null;

registerScene({

  desktop() {

    const scene = document.getElementById("scene-journey");
    if (!scene) return;

    const stage = scene.querySelector(".journey");
    const track = scene.querySelector(".journey__track");
    if (!stage || !track) return;

    const lead = scene.querySelector(".journey__lead");
    const textWrap = lead ? lead.querySelector(".scene-slower-text") : null;
    const headline = lead ? lead.querySelector(".scene-slower-headline") : null;
    const paragraph = lead ? lead.querySelector(".scene-slower-paragraph") : null;
    const link = lead ? lead.querySelector(".journey__start") : null;
    const figure = lead ? lead.querySelector(".scene-slower-figure") : null;
    const arch = figure ? figure.querySelector(".arch") : null;
    const archImg = arch ? arch.querySelector("img") : null;

    const panels = scene.querySelectorAll(".scene-gallery-panel");

    if (!arch || !panels.length) return;

    let tl = null;
    let splitInstances = [];

    function revertSplits() {
      splitInstances.forEach((split) => split.revert());
      splitInstances = [];
    }

    // D/introScroll/phaseBStart and each panel's own crossing
    // window, all derived from live measurements — called once
    // up front and again from build() on every real resize.
    function computeLayout() {

      const D = track.scrollWidth - window.innerWidth;
      const introScroll = 0.6 * window.innerHeight;
      const phaseBStart = introScroll / (introScroll + D);

      const panelOffsets = [...panels].map((panel) => {

        const panelLeft = panel.offsetLeft;
        const panelWidth = panel.offsetWidth;

        const position =
          phaseBStart +
          (1 - phaseBStart) * ((panelLeft - window.innerWidth) / D);

        // The formula assumes every panel travels its full
        // (panelWidth + innerWidth) crossing distance, but the
        // track physically stops at -D — for the last panel(s)
        // that's short of a full crossing, so their theoretical
        // window would run past the timeline's own end (1) and
        // inflate the whole timeline's totalDuration past 1,
        // breaking every other position on it. Clamp each
        // panel's own span to what's actually left before 1.
        const rawDuration =
          (1 - phaseBStart) *
          ((panelWidth + window.innerWidth) / D);
        const duration = Math.min(rawDuration, 1 - position);

        return { position, duration };

      });

      return { D, introScroll, phaseBStart, panelOffsets };

    }

    function build() {

      revertSplits();

      if (tl) {
        if (tl.scrollTrigger) tl.scrollTrigger.kill();
        tl.kill();
      }

      const { phaseBStart, panelOffsets } = computeLayout();

      // JS-only hidden start states, re-applied on every build
      // (including resize-rebuilds, where the previous timeline
      // may have left things mid-scrub) — CSS alone already
      // shows everything at its natural, fully visible size.
      gsap.set(arch, { scale: 0.55, transformOrigin: "center bottom" });
      if (archImg) gsap.set(archImg, { scale: 1.3, yPercent: 8 });
      panels.forEach((panel) => {
        const img = panel.querySelector(".scene-gallery-image img");
        if (img) gsap.set(img, { scale: 1.15 });
      });

      const panelImages = [...panels]
        .map((panel) => panel.querySelector(".scene-gallery-image img"))
        .filter(Boolean);

      tl = gsap.timeline({
        scrollTrigger: {
          trigger: scene,
          pin: stage,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          end: () =>
            "+=" +
            (track.scrollWidth - window.innerWidth + 0.6 * window.innerHeight),
          onToggle(self) {
            setWillChange([arch, archImg, track], "transform", self.isActive);
            setWillChange(panelImages, "transform", self.isActive);
            setWillChange([textWrap], "transform, opacity", self.isActive);
          }
        }
      });

      journeyTimeline = tl;

      /* ---- Phase A — intro (0 to phaseBStart) ---- */

      tl.to(arch, { scale: 1, duration: phaseBStart, ease: "power2.out" }, 0);

      if (archImg) {
        tl.to(
          archImg,
          { scale: 1, yPercent: 0, duration: phaseBStart, ease: "power2.out" },
          0
        );
      }

      if (headline) {
        const split = SplitText.create(headline, { type: "lines", mask: "lines" });
        splitInstances.push(split);
        tl.from(
          split.lines,
          {
            yPercent: 110,
            duration: phaseBStart * 0.6,
            ease: "power4.out",
            stagger: phaseBStart * 0.08
          },
          0
        );
      }

      const paragraphTargets = [paragraph, link].filter(Boolean);
      if (paragraphTargets.length) {
        tl.from(
          paragraphTargets,
          {
            opacity: 0,
            y: 20,
            duration: phaseBStart * 0.5,
            ease: "power3.out",
            stagger: phaseBStart * 0.1
          },
          phaseBStart * 0.35
        );
      }

      /* ---- Phase B — the line moves (phaseBStart to 1) ---- */

      const EASE_IN_FRACTION = 0.05;
      const phaseBDuration = 1 - phaseBStart;
      const easeInDuration = phaseBDuration * EASE_IN_FRACTION;
      const D = track.scrollWidth - window.innerWidth;

      // Two-segment track move: a short eased ramp off the
      // Phase A standstill, then the rest of the drive at a
      // constant (ease:none) velocity, so there's no abrupt
      // snap in scrub velocity right at the phase boundary.
      tl.to(
        track,
        {
          x: -D * EASE_IN_FRACTION,
          duration: easeInDuration,
          ease: "power2.in"
        },
        phaseBStart
      );

      tl.to(
        track,
        {
          x: -D,
          duration: phaseBDuration - easeInDuration,
          ease: "none"
        },
        phaseBStart + easeInDuration
      );

      if (textWrap) {
        tl.to(
          textWrap,
          { opacity: 0, y: "-6vh", duration: 0.12, ease: "power1.inOut" },
          phaseBStart
        );
      }

      // No x-move here — the arch is carried left by the track
      // tween above (it's a descendant of .journey__lead, a
      // track child); this only needs to shrink in place.
      tl.to(
        arch,
        { scale: 0.6, duration: 0.16, ease: "power1.inOut" },
        phaseBStart
      );

      /* ---- Gallery parallax — per panel ---- */

      // Label + headline now sit inside the image itself (see
      // villa.html/style2.css) and stay completely static — they
      // move only because the panel they're nested in moves with
      // the track. Only the img still parallaxes underneath them.
      panels.forEach((panel, i) => {

        const { position, duration } = panelOffsets[i];
        const img = panel.querySelector(".scene-gallery-image img");

        if (img) {
          tl.fromTo(
            img,
            { xPercent: -10 },
            { xPercent: 10, duration, ease: "none" },
            position
          );
        }

      });

    }

    build();

    // D, introScroll and every panel's position/duration above
    // all depend on live measurements that only change on an
    // actual resize, not on every scroll frame — invalidateOnRefresh
    // already re-evaluates this timeline's own function-based
    // `end` on any refresh, but the tween positions baked in by
    // build() need a full rebuild, not just re-evaluation, so
    // this scene gets its own width-gated resize listener (same
    // width-only guard used elsewhere in this file).
    let resizeTimer;
    let lastWidth = window.innerWidth;

    window.addEventListener("resize", () => {

      const currentWidth = window.innerWidth;
      if (currentWidth === lastWidth) return;
      lastWidth = currentWidth;

      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        ScrollTrigger.refresh();
      }, 250);

    });

  },

  /* -------------------------------------------------------
     #scene-journey — mobile

     No pin, no horizontal track: the lead's headline reveals,
     paragraph + link fade up, and the arch gets one simple
     scale/fade-up reveal, then each stacked panel's headline
     reveals with its image fading up as it's scrolled to.
  ------------------------------------------------------- */

  mobile() {

    const scene = document.getElementById("scene-journey");
    if (!scene) return;

    const lead = scene.querySelector(".journey__lead");
    const headline = lead ? lead.querySelector(".scene-slower-headline") : null;
    const paragraph = lead ? lead.querySelector(".scene-slower-paragraph") : null;
    const link = lead ? lead.querySelector(".journey__start") : null;
    const figure = lead ? lead.querySelector(".scene-slower-figure") : null;

    if (headline) revealLines(headline);

    const paragraphTargets = [paragraph, link].filter(Boolean);
    if (paragraphTargets.length) {
      gsap.from(paragraphTargets, {
        opacity: 0,
        y: 20,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: paragraph || link,
          start: "top 85%",
          once: true
        }
      });
    }

    if (figure) {
      gsap.from(figure, {
        opacity: 0,
        y: 30,
        scale: 0.92,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: figure,
          start: "top 85%",
          once: true
        }
      });
    }

    // Panel label/headline sit inside the image and stay static
    // at every width (see villa.html/style2.css) — only the
    // image itself (text included, as its child) fades up.
    const panels = scene.querySelectorAll(".scene-gallery-panel");

    panels.forEach((panel) => {

      const image = panel.querySelector(".scene-gallery-image");

      if (image) {
        gsap.from(image, {
          opacity: 0,
          y: 40,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: {
            trigger: panel,
            start: "top 85%",
            once: true
          }
        });
      }

    });

  }

});


/* -------------------------------------------------------
   #scene-journey — "Start exploring" button

   Wired up unconditionally (not inside desktop()/mobile() above)
   so it still does something reasonable under prefers-reduced-
   motion, where neither of those ever runs: full-motion desktop
   gets the automatic ScrollToPlugin glide through the whole
   pinned scene (reading journeyTimeline, set by desktop()'s
   build() above); everyone else — mobile, or reduced motion at
   any width, where the layout is the plain vertical stack — just
   gets a normal scrollIntoView to the first panel.
------------------------------------------------------- */

const journeyStartButton = document.querySelector(
  "#scene-journey .journey__start"
);

if (journeyStartButton) {

  journeyStartButton.addEventListener("click", () => {

    const isFullMotionDesktop = window.matchMedia(
      "(min-width: 901px) and (prefers-reduced-motion: no-preference)"
    ).matches;

    const st = journeyTimeline && journeyTimeline.scrollTrigger;

    if (isFullMotionDesktop && st && window.gsap && window.ScrollToPlugin) {

      const distance = st.end - window.scrollY;

      gsap.to(window, {
        scrollTo: { y: st.end, autoKill: true },
        duration: gsap.utils.clamp(5, 14, distance / 700),
        ease: "power1.inOut",
        overwrite: true
      });

    } else {

      const firstPanel = document.querySelector(
        "#scene-journey .scene-gallery-panel"
      );

      if (firstPanel) {
        firstPanel.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth"
        });
      }

    }

    // No layout shift: disabled + aria-hidden, faded out by
    // .journey__start:disabled in CSS rather than removed.
    journeyStartButton.disabled = true;
    journeyStartButton.setAttribute("aria-hidden", "true");

  });

}


/* -------------------------------------------------------
   #finale — pinned, one master timeline (finaleTl), three
   phases total. This build implements Phase 1 only (the pool
   card expanding to full-bleed, 0 to 0.36 of finaleTl) — later
   prompts add Phase 2/3 on the SAME finaleTl/scrollTrigger at
   the "PHASE 2/3 INSERT HERE" markers below, not new ones.

   Desktop: finaleTl is pinned for "+=900%" of scroll; Phase 1
   only spans the first 36% of that — the rest is empty runway
   reserved for Phase 2/3, not yet built. Unlike #scene-journey,
   nothing here depends on live pixel measurements (every value
   is a fixed percentage/number), so there's no build()/resize-
   rebuild machinery needed — same simpler pattern as #scene-
   intro/#scene-amenities.

   The pool video's OWN play/pause/preload lifecycle is handled
   separately by setupFinaleVideo() below, independent of width
   — see its own comment for why.
------------------------------------------------------- */

// Set by desktop()'s finaleTl creation below, read by
// setupFinaleVideo() further down — that function needs the
// PIN's own end position (not a literal "bottom top"), since
// once #finale is pinned for "+=900%" its natural bounding-rect
// bottom no longer reflects how long it actually stays on
// screen. Stays null on mobile (no pin there), where "bottom
// top" is used literally instead — see setupFinaleVideo().
let finaleTimeline = null;

registerScene({

  desktop() {

    const scene = document.getElementById("finale");
    if (!scene) return;

    const pool = scene.querySelector(".finale__pool");
    const video = scene.querySelector(".finale__video");
    const overlay = scene.querySelector(".finale__pool-overlay");
    const headline = scene.querySelector(".finale__headline");

    const arch = scene.querySelector(".finale__arch");
    const logo = scene.querySelector(".finale__logo");
    const statement = scene.querySelector(".finale__statement");
    const expandLayer = scene.querySelector(".finale__expand");
    const thumb = scene.querySelector(".finale__thumb");
    const thumbSlot = scene.querySelector(".finale__thumb-slot");

    const skylineFigure = scene.querySelector(".finale__expand-image--skyline");
    const skylineImg = skylineFigure ? skylineFigure.querySelector("img") : null;
    const rooftopFigure = scene.querySelector(".finale__expand-image--rooftop");
    const rooftopImg = rooftopFigure ? rooftopFigure.querySelector("img") : null;
    const finalWrap = scene.querySelector(".finale__final");
    const finalOverlay = scene.querySelector(".finale__final-overlay");
    const finalHeadline = scene.querySelector(".finale__final-headline");
    const finalCta = scene.querySelector(".finale__final-cta");

    if (!pool) return;

    // JS-only hidden start states — CSS alone already shows the
    // card fully expanded/full-bleed, overlay visible, headline
    // visible, video at its natural scale.
    //
    // The inset/radius are tweened as three separate custom
    // properties (--pool-inset-y/-x/-radius, referenced by
    // .finale__pool's own clip-path in style2.css), not as one
    // clip-path string — GSAP's generic string interpolator
    // diffs numeric tokens by position, but the browser itself
    // normalizes "22% 28% 22% 28% round 14px" down to
    // "22% 28% round 14px" (and drops "round 0px" entirely once
    // the radius is 0) before a tween ever reads it back, so the
    // start/end strings end up with mismatched token counts
    // regardless of how they're written — confirmed via
    // Playwright: it was sending the round radius ballooning to
    // ~250px mid-transition instead of a clean 14px -> 0px. Three
    // plain single-value custom properties sidestep that
    // entirely, each tweening as one clean number.
    gsap.set(pool, {
      "--pool-inset-y": "22%",
      "--pool-inset-x": "28%",
      "--pool-radius": "14px"
    });
    if (video) gsap.set(video, { scale: 1.3, transformOrigin: "center center" });
    if (overlay) gsap.set(overlay, { opacity: 0 });

    // Phase 2's own JS-only hidden start states — CSS already
    // shows the arch risen/covering (its hidden state is pushed
    // fully below via yPercent, not opacity, so it isn't set
    // here). .finale__expand/.finale__thumb/.finale__logo/
    // .finale__statement all default to opacity:0 in CSS now
    // (their true rest state — Phase 3 fades all of them out —
    // see style2.css), so logo doesn't need an explicit gsap.set
    // either. .finale__statement is the one exception: its own
    // "hidden" effect comes entirely from its SplitText lines'
    // mask/yPercent (same as every other headline in this file),
    // not from the wrapper's own opacity — so unlike logo, the
    // WRAPPER itself needs to be explicitly visible from the
    // start (CSS's opacity:0 is only the no-JS fallback), or its
    // line reveal below would animate invisibly behind a wrapper
    // that nothing ever brings back to opacity:1.
    if (arch) gsap.set(arch, { yPercent: 100 });
    if (statement) gsap.set(statement, { opacity: 1 });

    // .finale__expand itself now defaults to visible in CSS
    // (Phase 3 made it the sequence's own final state — see
    // style2.css), so its Phase 2 reveal tween (opacity/scale
    // 0.9->1 at 58-63%) needs its own explicit "from" here
    // instead of relying on a CSS default that no longer
    // provides it. skyline is the same story one level down:
    // visible from the start through most of the sequence, only
    // fading out later in Phase 3 (74-88%) — its CSS default is
    // now that later, final (faded-out) look, not its starting
    // one. rooftop needs nothing set: CSS's opacity:1 default
    // already matches how it looks from the very start too.
    if (expandLayer) gsap.set(expandLayer, { opacity: 0, scale: 0.9 });
    if (skylineFigure) gsap.set(skylineFigure, { opacity: 1 });
    if (skylineImg) gsap.set(skylineImg, { scale: 1.2 });
    if (rooftopImg) gsap.set(rooftopImg, { scale: 1.2 });
    if (finalOverlay) gsap.set(finalOverlay, { opacity: 0 });
    if (finalCta) gsap.set(finalCta, { opacity: 0, y: 20 });

    // Computes .finale__expand's clip-path + transform-origin
    // from .finale__thumb-slot's CURRENT on-screen position/size
    // relative to .finale__expand's own box — the difference
    // between the two rects is stable regardless of scroll
    // position (whether #finale is currently pinned/on-screen or
    // not), since both are measured in the same viewport-relative
    // coordinate system at the same instant. transform-origin
    // matters here because .finale__expand's own box is the FULL
    // stage (100vw/100vh), not just the visible thumbnail window
    // clip-path carves out of it — without re-centering the
    // scale(.9 -> 1) tween on the thumbnail's own center, it
    // would scale around the full stage's center instead and
    // visibly drift instead of growing in place.
    function computeThumbGeometry() {

      const expandRect = expandLayer.getBoundingClientRect();
      const slotRect = thumbSlot.getBoundingClientRect();

      const top = slotRect.top - expandRect.top;
      const left = slotRect.left - expandRect.left;
      const right = expandRect.right - slotRect.right;
      const bottom = expandRect.bottom - slotRect.bottom;

      return {
        clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)`,
        transformOrigin: `${left + slotRect.width / 2}px ${top + slotRect.height / 2}px`
      };

    }

    // No invalidateOnRefresh here — unlike #scene-journey, none
    // of Phase 1's tween values depend on live measurements (all
    // fixed percentages/numbers, explicitly set by gsap.set()
    // above), so there's nothing that genuinely needs re-
    // capturing on refresh. Confirmed via Playwright that leaving
    // it on actively breaks this: GSAP's recapture-on-refresh
    // doesn't correctly round-trip the CSS custom properties
    // --pool-inset-y/-x/-radius below, resetting them to their
    // END values (0%/0%/0px) the moment any refresh fires (e.g.
    // the window "load" refresh elsewhere in this file) even
    // while still sitting at scroll position 0 / progress 0.
    //
    // onRefreshInit (not invalidateOnRefresh) is what keeps
    // .finale__expand's clip-path/transform-origin correct on
    // resize — it's not part of the scrubbed timeline at all
    // (Phase 2 only tweens its opacity/scale, never its shape),
    // so it just needs recomputing once per refresh, which this
    // callback handles directly regardless of the flag above.
    const finaleTl = gsap.timeline({
      scrollTrigger: {
        trigger: scene,
        start: "top top",
        end: "+=900%",
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        onToggle(self) {
          setWillChange([pool, video, arch, expandLayer], "transform, opacity, clip-path", self.isActive);
          setWillChange([overlay, logo, statement, skylineFigure], "opacity", self.isActive);
          setWillChange([skylineImg, rooftopImg], "transform", self.isActive);
          setWillChange([finalOverlay, finalCta], "opacity, transform", self.isActive);
        },
        onRefreshInit() {
          if (!expandLayer || !thumbSlot) return;
          gsap.set(expandLayer, computeThumbGeometry());
        }
      }
    });

    finaleTimeline = finaleTl;

    /* ---- Phase 1 — pool card expands (0 to 0.36) ---- */

    finaleTl.to(
      pool,
      {
        "--pool-inset-y": "0%",
        "--pool-inset-x": "0%",
        "--pool-radius": "0px",
        duration: 0.25,
        ease: "power2.inOut"
      },
      0
    );

    if (video) {
      finaleTl.to(video, { scale: 1, duration: 0.25, ease: "power2.inOut" }, 0);
    }

    if (overlay) {
      finaleTl.to(overlay, { opacity: 1, duration: 0.25, ease: "power2.inOut" }, 0);
    }

    if (headline) {

      const split = SplitText.create(headline, { type: "lines", mask: "lines" });

      finaleTl.from(
        split.lines,
        { yPercent: 110, duration: 0.08, ease: "power4.out", stagger: 0.02 },
        0.2
      );

      finaleTl.to(
        headline,
        { opacity: 0, y: -30, duration: 0.03, ease: "power1.in" },
        0.33
      );

    }

    /* ---- Phase 2 — arch sweeps over the pool, statement + ----
       ---- logo appear, thumbnail reveals (0.36 to 0.66) ---- */

    if (arch) {
      finaleTl.to(
        arch,
        { yPercent: 0, duration: 0.19, ease: "power2.inOut" },
        0.36
      );
    }

    if (statement) {

      const statementSplit = SplitText.create(statement, {
        type: "lines",
        mask: "lines"
      });

      finaleTl.from(
        statementSplit.lines,
        { yPercent: 110, duration: 0.07, ease: "power4.out", stagger: 0.015 },
        0.52
      );

    }

    if (logo) {
      finaleTl.to(logo, { opacity: 1, duration: 0.03, ease: "power1.out" }, 0.55);
    }

    if (expandLayer) {
      finaleTl.to(
        expandLayer,
        { opacity: 1, scale: 1, duration: 0.05, ease: "power2.out" },
        0.58
      );
    }

    if (thumb) {
      finaleTl.to(thumb, { opacity: 1, duration: 0.05, ease: "power2.out" }, 0.58);
    }

    // Hold until 0.66 (Phase 2's own end) — nothing further
    // touches these properties until Phase 3, so they simply
    // stay at their settled values with no extra tween needed.

    /* ---- Phase 3 — thumbnail grows to full-screen rooftop, ----
       ---- headline + CTA close the sequence (0.66 to 1) ---- */

    if (statement) {
      finaleTl.to(statement, { opacity: 0, duration: 0.1, ease: "power1.inOut" }, 0.66);
    }

    if (logo) {
      finaleTl.to(logo, { opacity: 0, duration: 0.1, ease: "power1.inOut" }, 0.66);
    }

    if (thumb) {
      finaleTl.to(thumb, { opacity: 0, duration: 0.1, ease: "power1.inOut" }, 0.66);
    }

    if (expandLayer) {

      // Same reasoning as Phase 1/2's clip-path work: keep the
      // target in the SAME plain-pixel, no-"round" structure as
      // the refreshInit-computed starting value (4 numbers, no
      // round) rather than writing "inset(0 round 0)" — mismatched
      // token counts between a tween's start/end clip-path
      // strings is what caused the round-radius-ballooning bug
      // found and fixed in Phase 1, and "0px 0px 0px 0px" is
      // visually identical to "0 round 0" (square corners, no
      // clipping) without risking the same mismatch here.
      finaleTl.to(
        expandLayer,
        {
          clipPath: "inset(0px 0px 0px 0px)",
          duration: 0.22,
          ease: "power3.inOut"
        },
        0.66
      );

    }

    if (skylineImg) {
      finaleTl.to(skylineImg, { scale: 1, duration: 0.22, ease: "power3.inOut" }, 0.66);
    }

    if (rooftopImg) {
      finaleTl.to(rooftopImg, { scale: 1, duration: 0.22, ease: "power3.inOut" }, 0.66);
    }

    if (skylineFigure) {
      finaleTl.to(
        skylineFigure,
        { opacity: 0, duration: 0.14, ease: "power1.inOut" },
        0.74
      );
    }

    if (finalOverlay) {
      finaleTl.to(finalOverlay, { opacity: 1, duration: 0.08, ease: "power1.inOut" }, 0.86);
    }

    if (finalHeadline) {

      const finalSplit = SplitText.create(finalHeadline, {
        type: "lines",
        mask: "lines"
      });

      finaleTl.from(
        finalSplit.lines,
        { yPercent: 110, duration: 0.06, ease: "power4.out", stagger: 0.015 },
        0.86
      );

    }

    if (finalCta) {
      finaleTl.to(
        finalCta,
        { opacity: 1, y: 0, duration: 0.05, ease: "power2.out" },
        0.9
      );
    }

    // Hold to 1 (Phase 3's own end, and the pin's own release) —
    // nothing further touches these properties, so they simply
    // stay at their settled values. This also doubles as the
    // "reserve the rest of finaleTl's length" placeholder Phase
    // 1/2 needed while they were the only content: real content
    // now reaches all the way to 1 on its own, so this is just
    // confirming it lands there exactly rather than slightly
    // short of it.
    finaleTl.to({}, { duration: 0 }, 1);

  },

  /* -------------------------------------------------------
     #finale — mobile

     No pin: .finale__pool is a plain 70vh card in normal flow,
     its clip-path simply scrubbed (not timeline-phased) as the
     section scrolls past, headline revealed the same simple
     way every other scene's mobile() does. Phase 2's elements
     (restyled to a plain stacked block in style2.css — no
     clip-path-from-geometry trick needed at this width) each
     get their own independent fade-up, same pattern.
  ------------------------------------------------------- */

  mobile() {

    const scene = document.getElementById("finale");
    if (!scene) return;

    const pool = scene.querySelector(".finale__pool");
    const headline = scene.querySelector(".finale__headline");

    if (!pool) return;

    gsap.set(pool, { clipPath: "inset(18% round 14px)" });

    gsap.to(pool, {
      clipPath: "inset(0% round 14px)",
      ease: "none",
      scrollTrigger: {
        trigger: scene,
        start: "top 80%",
        end: "top 20%",
        scrub: 1,
        invalidateOnRefresh: true
      }
    });

    if (headline) revealLines(headline);

    const arch = scene.querySelector(".finale__arch");
    const logo = scene.querySelector(".finale__logo");
    const statement = scene.querySelector(".finale__statement");
    const expandLayer = scene.querySelector(".finale__expand");
    const thumb = scene.querySelector(".finale__thumb");

    if (arch) {
      gsap.from(arch, {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: arch, start: "top 85%", once: true }
      });
    }

    if (logo) {
      gsap.from(logo, {
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        scrollTrigger: { trigger: arch, start: "top 85%", once: true }
      });
    }

    if (statement) revealLines(statement);

    if (expandLayer) {
      gsap.from(expandLayer, {
        opacity: 0,
        y: 30,
        scale: 0.95,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: expandLayer, start: "top 85%", once: true }
      });
    }

    if (thumb) {
      gsap.from(thumb, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: thumb, start: "top 90%", once: true }
      });
    }

    // Phase 3's closing block — .finale__final is its own 70vh
    // rooftop-image card here (see style2.css), not the full-
    // stage overlay it is on desktop, so one plain fade-up for
    // the whole card covers it; the headline inside still gets
    // its own line reveal and the CTA its own slightly-delayed
    // fade-up, same staggered feel as the desktop timeline's.
    const finalWrap = scene.querySelector(".finale__final");
    const finalHeadline = scene.querySelector(".finale__final-headline");
    const finalCta = scene.querySelector(".finale__final-cta");

    if (finalWrap) {
      gsap.from(finalWrap, {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: finalWrap, start: "top 85%", once: true }
      });
    }

    if (finalHeadline) revealLines(finalHeadline);

    if (finalCta) {
      gsap.from(finalCta, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: finalCta, start: "top 92%", once: true }
      });
    }

  }

});


/* -------------------------------------------------------
   #finale — ambient pool video playback

   Independent of desktop()/mobile() above (and of finaleTl's
   own scrub) — the video plays/pauses as a NORMAL loop based on
   scroll proximity to #finale, the same way at any viewport
   width, so it's already moving by the time Phase 1's clip-path
   reveals it. Skipped entirely under reduced motion or Save-
   Data: in both cases this function returns before touching the
   video at all, so no request for it is ever made and the
   native poster stays as the only thing shown.

   The video's opacity is intentionally left alone until
   "playing" actually fires (fromTo, not a pre-set gsap.set to
   0) — setting it to 0 upfront would also hide its own poster
   image the whole time autoplay hasn't succeeded yet (which can
   be forever, e.g. a missing file or a browser that rejects
   it), breaking the required "still image" fallback.

   iOS requires muted+playsinline to allow any autoplay at all
   (both are set permanently in the markup) — nothing here (or
   anywhere else) may ever set video.muted = false.
------------------------------------------------------- */

function setupFinaleVideo() {

  const scene = document.getElementById("finale");
  const video = scene ? scene.querySelector(".finale__video") : null;
  if (!video) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);

  if (reducedMotion || saveData) return;

  video.addEventListener("playing", () => {
    gsap.fromTo(
      video,
      { opacity: 0 },
      { opacity: 1, duration: 0.6, ease: "power1.out" }
    );
  });

  ScrollTrigger.create({
    trigger: scene,
    start: "top bottom+=50%",
    // Not a literal "bottom top" — once desktop() pins #finale
    // for "+=900%", its natural bounding-rect bottom no longer
    // reflects how long it actually stays on screen (confirmed
    // via Playwright: a literal "bottom top" here ended the
    // active range after less than a ninth of the actual pinned
    // scroll distance, pausing the video while the card was
    // still mid-expansion). Reads the real pin's end once it
    // exists; falls back to a literal "bottom top" on mobile,
    // where #finale is never pinned at all.
    end: () => {
      const pinTrigger = finaleTimeline && finaleTimeline.scrollTrigger;
      return pinTrigger ? pinTrigger.end : "bottom top";
    },
    onToggle(self) {
      if (self.isActive) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  });

  // Starts loading a full screen earlier than playback actually
  // begins, so it already has frames ready by the time the
  // ScrollTrigger above tells it to play.
  ScrollTrigger.create({
    trigger: scene,
    start: "top bottom+=100%",
    once: true,
    onEnter() {
      video.preload = "auto";
    }
  });

}


if (window.gsap && window.ScrollTrigger && window.SplitText) {
  initStory();
  setupFinaleVideo();
}


/* =========================================================
   SCROLLTRIGGER REFRESH TRIGGERS

   Scene content (SplitText lines, images loading in) can
   change document height after ScrollTrigger first calculates
   start/end positions, so refresh again once: the window has
   fully loaded, web fonts have finished loading (changes text
   measurement), and the hero video's metadata is ready (its
   poster/first-frame can affect layout height right at the
   top of the page). This only ever recalculates existing
   ScrollTriggers — the hero's own scrub is plain
   getBoundingClientRect() math with no ScrollTrigger involved,
   so none of this touches or risks its behaviour.
========================================================= */

if (window.ScrollTrigger) {

  window.addEventListener("load", () => ScrollTrigger.refresh());

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  if (heroVideo) {

    // Same already-fired race as the hero's own loadedmetadata
    // handling above: check current state first.
    if (heroVideo.readyState >= 1) {
      ScrollTrigger.refresh();
    } else {
      heroVideo.addEventListener(
        "loadedmetadata",
        () => ScrollTrigger.refresh(),
        { once: true }
      );
    }

  }

}
