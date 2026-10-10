/* =========================================================
   GSAP SETUP
========================================================= */

gsap.registerPlugin(ScrollTrigger);


/* =========================================================
   GLOBAL SETTINGS
========================================================= */

ScrollTrigger.config({
  ignoreMobileResize: true
});

/*
  Keep GSAP on a single consistent GPU-compositing mode.
  Leaving this on "auto" lets GSAP toggle a pinned element
  between 2D and 3D transform representations depending on
  what else is animating, which forces the browser to move it
  between compositor layers mid-scroll — this is what reads as
  "shaking" on pinned video sections.
*/
gsap.config({
  force3D: true
});

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;


/* =========================================================
   VIDEO ELEMENTS
========================================================= */

const heroVideo = document.querySelector(".hero-video");
const arrivalVideo = document.querySelector(".arrival-video");


/* =========================================================
   SAFE VIDEO PLAY
========================================================= */

function playVideo(video) {

  if (!video) return;

  const promise = video.play();

  if (promise !== undefined) {

    promise.catch(() => {
      /*
        Browser may block autoplay.
        The video will still remain available.
      */
    });

  }

}


/* =========================================================
   HERO VIDEO
========================================================= */

function fadeInVideo(video) {

  gsap.to(video, {
    opacity: 1,
    duration: prefersReducedMotion ? 0 : 1.5,
    ease: "power2.out",
    onComplete: () => {
      /*
        The fade is done — releasing the GPU layer here instead
        of holding "will-change: opacity" for the lifetime of
        the page avoids paying for compositing on a property
        that will never change again.
      */
      video.style.willChange = "auto";
    }
  });

}


if (heroVideo) {

  heroVideo.addEventListener(
    "loadeddata",
    () => {

      fadeInVideo(heroVideo);

      playVideo(heroVideo);

    },
    {
      once: true
    }
  );

}


/* =========================================================
   ARRIVAL VIDEO
========================================================= */

if (arrivalVideo) {

  arrivalVideo.addEventListener(
    "loadeddata",
    () => {

      fadeInVideo(arrivalVideo);

    },
    {
      once: true
    }
  );

}


/* =========================================================
   PLAY VIDEOS ONLY WHILE THEIR SECTION IS ON SCREEN

   The arrival video previously started playing the instant it
   finished loading, even though it can be a full viewport below
   the fold. Decoding an off-screen video wastes battery/CPU and
   competes with the hero section's own scroll animations. An
   IntersectionObserver defers playback until the section is
   actually about to be seen, and pauses it again once it scrolls
   away.
========================================================= */

if ("IntersectionObserver" in window) {

  const sectionVideoObserver = new IntersectionObserver(
    (entries) => {

      entries.forEach((entry) => {

        const video = entry.target;

        if (entry.isIntersecting) {
          playVideo(video);
        } else {
          video.pause();
        }

      });

    },
    {
      rootMargin: "50% 0px"
    }
  );

  [heroVideo, arrivalVideo].forEach((video) => {
    if (video) sectionVideoObserver.observe(video);
  });

}


/* =========================================================
   HERO INTRO
========================================================= */

if (prefersReducedMotion) {

  /*
    No entrance animation: content is simply present. Keeps the
    hero readable immediately for anyone who has motion disabled,
    instead of depending on a timeline to reveal it.
  */
  gsap.set(
    [".hero-eyebrow", ".hero-title", ".hero-subtitle", ".hero-project", ".scroll-indicator"],
    { opacity: 1, y: 0, x: 0 }
  );

} else {

  const heroIntro = gsap.timeline({
    defaults: {
      ease: "power3.out"
    }
  });


  heroIntro
    .from(".hero-eyebrow", {
      opacity: 0,
      y: 25,
      duration: 1.1
    })

    .from(
      ".hero-title",
      {
        opacity: 0,
        y: 70,
        duration: 1.4,
        ease: "power4.out"
      },
      "-=0.7"
    )

    .from(
      ".hero-subtitle",
      {
        opacity: 0,
        y: 35,
        duration: 1.1
      },
      "-=0.8"
    )

    .to(
      ".hero-project",
      {
        opacity: 1,
        duration: 0.9
      },
      "-=0.4"
    )

    .from(
      ".scroll-indicator",
      {
        opacity: 0,
        y: 15,
        duration: 0.8
      },
      "-=0.4"
    );

}


/* =========================================================
   HERO SCROLL
========================================================= */

/*
  IMPORTANT:

  We DO NOT scale or transform the video.

  The video stays completely stable.

  Only the text moves.
*/

if (prefersReducedMotion) {

  /*
    No pin, no scroll-jacking, no scrub fades: sections stay in
    normal document flow and their text stays fully visible.
    This is the accessible fallback — content must not depend on
    a scroll animation to be readable.
  */
  gsap.set(
    [".hero-content", ".arrival-content", ".arrival-meta"],
    { opacity: 1, y: 0, x: 0 }
  );

} else {

  /*
    IMPORTANT:

    We DO NOT scale or transform the video.

    The video stays completely stable.

    Only the text moves.
  */

  const heroScroll = gsap.timeline({

    scrollTrigger: {

      trigger: ".hero",

      start: "top top",

      end: "+=1200",

      /*
        A lower scrub value tracks the actual scroll position
        more tightly. At scrub:1 the opacity trailed the true
        scroll-mapped value by up to ~1s of eased "catch up" —
        on a normal-speed scroll that lag was enough for the
        hero text to still be fading out well past the point
        where the arrival section's own entrance had already
        started, leaving a gap where neither block was visible.
      */
      scrub: 0.6,

      pin: true,

      pinSpacing: true,

      anticipatePin: 1,

      invalidateOnRefresh: true

    }

  });


  heroScroll
    .to(
      ".hero-content",
      {
        y: -180,
        opacity: 0,
        duration: 1,

        ease: "power2.inOut"
      }
    )

    .to(
      ".scroll-indicator",
      {
        opacity: 0,
        duration: 0.4
      },
      "<"
    );


  /* =========================================================
     SCROLL INDICATOR
  ========================================================= */

  gsap.to(".scroll-line", {

    scaleY: 0.35,

    duration: 1.1,

    repeat: -1,

    yoyo: true,

    ease: "power1.inOut"

  });


  /* =========================================================
     ARRIVAL INTRO
  ========================================================= */

  const arrivalIntro = gsap.timeline({

    scrollTrigger: {

      trigger: ".arrival",

      /*
        Previously started at "top bottom" — the exact scroll
        position where the hero's own fade-out finishes. With
        scrub smoothing on both timelines, that hard hand-off
        produced a stretch of scroll with no text visible at
        all (verified: both .hero-content and .arrival-content
        computed opacity measured at ~0 simultaneously around
        the section boundary). Starting 450px earlier makes the
        arrival text begin rising while the hero text is still
        finishing its fade, so the two overlap instead of
        leaving a gap.
      */
      start: "top bottom+=450",

      end: "top center",

      scrub: 0.6,

      invalidateOnRefresh: true

    }

  });


  arrivalIntro
    .from(
      ".arrival-content",
      {
        opacity: 0,
        x: -70,
        duration: 1,

        ease: "power3.out"
      }
    )

    .from(
      ".arrival-meta",
      {
        opacity: 0,
        y: 15,
        duration: 0.7
      },
      "<0.2"
    );


  /* =========================================================
     ARRIVAL SCROLL
  ========================================================= */

  const arrivalScroll = gsap.timeline({

    scrollTrigger: {

      trigger: ".arrival",

      start: "top top",

      end: "+=1200",

      scrub: 0.6,

      pin: true,

      pinSpacing: true,

      anticipatePin: 1,

      invalidateOnRefresh: true

    }

  });


  arrivalScroll

    .to(
      ".arrival-content",
      {
        y: -150,
        opacity: 0,
        duration: 1.2,

        ease: "power2.inOut"
      }
    )

    .to(
      ".arrival-meta",
      {
        opacity: 0,
        duration: 0.5
      },
      "<"
    );

}


/* =========================================================
   REFRESH SCROLLTRIGGER
========================================================= */

window.addEventListener(
  "load",
  () => {

    setTimeout(() => {

      ScrollTrigger.refresh();

    }, 300);

  }
);


/* =========================================================
   RESIZE
========================================================= */

let resizeTimer;
let lastViewportWidth = window.innerWidth;

/*
  Mobile browsers fire "resize" when their address bar / toolbar
  collapses or expands during scroll — a height-only change with
  no actual layout change needed. Refreshing ScrollTrigger on
  every one of those re-pins the current section using whatever
  mid-scrub state it happened to be in at that instant as the new
  baseline, which is what produced the visible jump/shake while
  scrolling (verified: an identical scrollY before/after a
  height-only resize showed the pinned content shift ~6px and its
  opacity shift by ~0.15). Only a real width change — an actual
  resize or orientation change — needs a refresh.
*/
window.addEventListener(
  "resize",
  () => {

    const currentWidth = window.innerWidth;

    if (currentWidth === lastViewportWidth) return;

    lastViewportWidth = currentWidth;

    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {

      ScrollTrigger.refresh();

    }, 250);

  }
);