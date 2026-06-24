(function () {
  var ASSET_ROOT = "./story-assets/";
  var ASSET_VERSION = "?v=atom-2-visible-scrub-20260624-1";
  var ATOM_IMAGE_2 = ASSET_ROOT + "atom-2-image-2.png" + ASSET_VERSION;
  var HERO_BASE_IMAGE = ATOM_IMAGE_2;
  var FINAL_SCRUB_VIDEO = ASSET_ROOT + "atom-2-scroll-video.mp4" + ASSET_VERSION;
  var SCRUB_END_TIME = 13;
  var SCRUB_WHEEL_VIEWPORTS = 3.2;
  var SCRUB_TOUCH_VIEWPORTS = 2.4;
  var SCRUB_KEY_STEP = 0.075;
  var SCRUB_PAGE_KEY_STEP = 0.16;
  var SCRUB_TRANSITION_DURATION_MS = 900;
  var VIDEO_PLAYBACK_RATE = 1.9;
  var HANDOFF_FADE_MS = 200;
  var HANDOFF_DECODE_TIMEOUT_MS = 120;
  var WHEEL_TRIGGER_DELTA = 4;
  var WHEEL_RESET_MS = 180;
  var TOUCH_TRIGGER_DELTA = 18;
  var SCRUB_START_STATE_INDEX = 0;
  var FINAL_STATE_INDEX = 3;
  var FINAL_SCRUB_FPS = 24;
  var FINAL_SCRUB_EASE = 0.18;
  var FINAL_SCRUB_SETTLE_EPSILON = 0.0015;
  var FINAL_SCRUB_SEEK_EPSILON = 0.02;
  var LOCKED_KEYS = {
    ArrowDown: 1,
    PageDown: 1,
    " ": 1,
    ArrowUp: -1,
    PageUp: -1
  };

  var states = [
    {
      image: HERO_BASE_IMAGE,
      text: {
        title: ["Curated", "Lived", "Spaces"],
        subtitle: "Unlocking Refined Atmosphere For Design-Led Living"
      }
    },
    {
      image: "",
      text: {
        title: ["Composed", "Spaces"],
        subtitle: "Lasting Atmosphere."
      }
    },
    {
      image: "",
      text: {
        title: ["Story", "Led", "Spaces"],
        subtitle: "Interior Design, Composed.",
        note: {
          text: "Every project begins with atmosphere, then moves through rhythm, material, light, and use until the space feels resolved.",
          placement: "below",
          variant: "boxed"
        }
      }
    },
    {
      image: "",
      text: {
        title: ["Process"],
        subtitle: "Initial Atmosphere. Design Direction. Material Resolution.",
        note: {
          text: "From atmosphere to resolution, each decision is shaped with restraint, clarity, and intent.",
          placement: "above",
          variant: "lede"
        }
      }
    }
  ];

  var edges = [];

  var currentState = 0;
  var heroSection = null;
  var inputLocked = false;
  var activeTransition = null;
  var touchStartY = 0;
  var touchConsumed = false;
  var wheelDelta = 0;
  var wheelResetTimer = 0;
  var lockedScrollY = 0;
  var restSections = [];
  var targets = [];
  var transitionLayer;
  var fixedVisualLayer;
  var fixedVisualImage;
  var finalScrubVideo;
  var finalScrubActive = false;
  var finalScrubTransition = null;
  var finalScrubReadyPromise = null;
  var finalScrubResolve = null;
  var finalScrubVideoReady = false;
  var finalScrubVideoFailed = false;
  var finalScrubFetchStarted = false;
  var finalScrubWarmStarted = false;
  var finalScrubRatio = 0;
  var finalScrubDisplayRatio = 0;
  var finalScrubFrame = 0;
  var finalScrubDurationWarned = false;
  var restVisualImage;
  var heroStaticLayer;
  var heroStaticImage;
  var waterFrame = null;
  var waterPoint = { x: 50, y: 50 };
  var imageReadyPromises = {};
  var videoPreloadLinks = {};
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initStoryFlow() {
    var hero = document.querySelector(".hero-section.is-home:not(.power)");
    var footer = document.querySelector("footer.footer-section");

    if (!hero || !footer) {
      return;
    }

    heroSection = hero;
    document.body.classList.add("nt-story-active");
    document.body.setAttribute("data-nt-story-state", "0");
    syncHeroCopyAnchor();
    window.addEventListener("resize", syncHeroCopyAnchor, { passive: true });
    window.setTimeout(function () {
      document.body.classList.add("nt-loader-finished");
    }, 900);

    buildStaticHero(hero);
    buildStorySections(hero);
    buildFixedVisualLayer();
    buildTransitionLayer();
    buildFinalFooterVideo(footer);
    targets = [hero].concat(restSections).concat([footer]);

    setVisualForState(0);
    setupInput();
    setupStateSync();
    preloadAround(0);
    preloadAllMedia();
  }

  function buildStaticHero(hero) {
    if (hero.querySelector(".nt-story-hero-static")) {
      heroStaticLayer = hero.querySelector(".nt-story-hero-static");
      heroStaticImage = heroStaticLayer.querySelector("img");
      return;
    }

    var shell = document.createElement("div");
    var image = document.createElement("img");

    shell.className = "nt-story-hero-static";
    shell.setAttribute("aria-hidden", "true");

    image.className = "nt-story-hero-base-image";
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.loading = "eager";
    image.src = HERO_BASE_IMAGE;

    shell.appendChild(image);
    hero.insertBefore(shell, hero.firstChild);
    heroStaticLayer = shell;
    heroStaticImage = image;

    hero.addEventListener("pointerenter", updateWaterEffect);
    hero.addEventListener("pointermove", updateWaterEffect);
    hero.addEventListener("pointerleave", clearWaterEffect);
  }

  function updateWaterEffect(event) {
    if (!heroStaticLayer || currentState !== 0 || inputLocked) {
      return;
    }

    var rect = heroStaticLayer.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    waterPoint.x = event.clientX - rect.left;
    waterPoint.y = event.clientY - rect.top;
    heroStaticLayer.style.setProperty("--nt-water-x", waterPoint.x + "px");
    heroStaticLayer.style.setProperty("--nt-water-y", waterPoint.y + "px");
    heroStaticLayer.classList.add("is-water-active");

    if (waterFrame) {
      return;
    }

    waterFrame = window.requestAnimationFrame(function () {
      heroStaticLayer.style.setProperty("--nt-water-x", waterPoint.x + "px");
      heroStaticLayer.style.setProperty("--nt-water-y", waterPoint.y + "px");
      waterFrame = null;
    });
  }

  function clearWaterEffect() {
    if (!heroStaticLayer) {
      return;
    }

    heroStaticLayer.classList.remove("is-water-active");
  }

  function buildStorySections(hero) {
    var shell = document.createElement("div");
    shell.className = "nt-story-shell";
    shell.setAttribute("data-story-system", "chapters");

    restSections = states.slice(1, FINAL_STATE_INDEX).map(function (_state, index) {
      var section = document.createElement("section");
      var content = document.createElement("div");

      section.className = "nt-story-rest";
      section.setAttribute("data-story-state", String(index + 1));
      content.className = "nt-story-content";
      content.appendChild(createStateText(index + 1, "nt-story-state-copy"));

      section.appendChild(content);
      shell.appendChild(section);
      return section;
    });

    hero.insertAdjacentElement("afterend", shell);
  }

  function buildTransitionLayer() {
    transitionLayer = document.createElement("div");
    transitionLayer.className = "nt-story-transition";
    transitionLayer.setAttribute("aria-hidden", "true");
    document.body.appendChild(transitionLayer);
  }

  function buildFixedVisualLayer() {
    fixedVisualLayer = document.createElement("div");
    fixedVisualLayer.className = "nt-story-fixed-visual";
    fixedVisualLayer.setAttribute("aria-hidden", "true");

    fixedVisualImage = document.createElement("img");
    fixedVisualImage.alt = "";
    fixedVisualImage.draggable = false;
    fixedVisualImage.decoding = "async";

    fixedVisualLayer.appendChild(fixedVisualImage);
    document.body.appendChild(fixedVisualLayer);
  }

  function buildFinalFooterVideo(footer) {
    if (!footer) {
      return;
    }

    finalScrubVideo = document.createElement("video");
    finalScrubVideo.className = "nt-story-hero-video nt-story-scroll-scrub-video";
    finalScrubVideo.muted = true;
    finalScrubVideo.playsInline = true;
    finalScrubVideo.preload = "auto";
    finalScrubVideo.setAttribute("muted", "");
    finalScrubVideo.setAttribute("playsinline", "");
    finalScrubVideo.setAttribute("preload", "auto");
    finalScrubVideo.setAttribute("aria-hidden", "true");
    finalScrubVideo.src = FINAL_SCRUB_VIDEO;

    finalScrubVideo.pause();
    finalScrubVideo.addEventListener("loadedmetadata", markFinalScrubVideoReady);
    finalScrubVideo.addEventListener("loadeddata", markFinalScrubVideoReady);
    finalScrubVideo.addEventListener("canplay", markFinalScrubVideoReady);
    finalScrubVideo.addEventListener("error", markFinalScrubVideoFailed);
    finalScrubVideo.load();
    restoreFinalScrubVideoToHero();
    requestFinalScrubVideo();
  }

  function setupInput() {
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    window.addEventListener("keydown", handleKeyDown, { passive: false });
  }

  function handleWheel(event) {
    var rawDirection = getRawDirection(event.deltaY);

    if (handleFinalScrubInput(rawDirection, event.deltaY / getScrubWheelDistance())) {
      stopInput(event);
      return;
    }

    if (inputLocked) {
      stopInput(event);
      return;
    }

    if (!rawDirection) {
      return;
    }

    if (rawDirection > 0 && isFinalStateActive()) {
      stopInput(event);
      scrollToState(FINAL_STATE_INDEX);
      return;
    }

    if (!canMove(rawDirection)) {
      if (isFinalForwardInput(rawDirection)) {
        stopInput(event);
        scrollToState(FINAL_STATE_INDEX);
      }
      return;
    }

    stopInput(event);
    wheelDelta += event.deltaY;
    window.clearTimeout(wheelResetTimer);
    wheelResetTimer = window.setTimeout(function () {
      wheelDelta = 0;
    }, WHEEL_RESET_MS);

    var direction = getDirection(wheelDelta);
    if (!direction || !canMove(direction)) {
      return;
    }

    wheelDelta = 0;
    beginTransition(currentState + direction);
  }

  function handleTouchStart(event) {
    if (inputLocked) {
      stopInput(event);
      return;
    }

    if (!event.touches || !event.touches.length) {
      return;
    }

    touchStartY = event.touches[0].clientY;
    touchConsumed = false;
  }

  function handleTouchMove(event) {
    if (inputLocked) {
      stopInput(event);
      return;
    }

    if (!event.touches || !event.touches.length) {
      return;
    }

    var delta = touchStartY - event.touches[0].clientY;
    var direction = getRawDirection(delta);

    if (handleFinalScrubInput(direction, delta / getScrubTouchDistance())) {
      stopInput(event);
      touchStartY = event.touches[0].clientY;
      return;
    }

    if (!direction || !canMove(direction)) {
      return;
    }

    stopInput(event);

    if (touchConsumed || Math.abs(delta) < TOUCH_TRIGGER_DELTA) {
      return;
    }

    touchConsumed = true;
    beginTransition(currentState + direction);
  }

  function handleTouchEnd(event) {
    if (inputLocked) {
      stopInput(event);
      return;
    }

    touchConsumed = false;
  }

  function handleKeyDown(event) {
    var direction = LOCKED_KEYS[event.key];

    if (event.key === " " && event.shiftKey) {
      direction = -1;
    }

    if (inputLocked) {
      if (direction || event.key === "Home" || event.key === "End") {
        stopInput(event);
      }
      return;
    }

    if (!direction) {
      return;
    }

    if (handleFinalScrubInput(direction, getKeyScrubDelta(event, direction))) {
      stopInput(event);
      return;
    }

    if (direction > 0 && isFinalStateActive()) {
      stopInput(event);
      scrollToState(FINAL_STATE_INDEX);
      return;
    }

    if (!canMove(direction)) {
      if (isFinalForwardInput(direction)) {
        stopInput(event);
        scrollToState(FINAL_STATE_INDEX);
      }
      return;
    }

    stopInput(event);
    beginTransition(currentState + direction);
  }

  function handleFinalScrubInput(direction, progressDelta) {
    if (!direction) {
      return false;
    }

    if (!finalScrubActive) {
      if (currentState === SCRUB_START_STATE_INDEX && direction > 0) {
        activateFinalScrub(createFinalScrubTransition(1), 0);
      } else if (isFinalStateActive() && direction < 0) {
        activateFinalScrub(createFinalScrubTransition(-1), 1);
      } else {
        return false;
      }
    }

    updateFinalScrubRatio(progressDelta, direction);
    return true;
  }

  function getScrubWheelDistance() {
    return Math.max(1, window.innerHeight || 1) * SCRUB_WHEEL_VIEWPORTS;
  }

  function getScrubTouchDistance() {
    return Math.max(1, window.innerHeight || 1) * SCRUB_TOUCH_VIEWPORTS;
  }

  function getKeyScrubDelta(event, direction) {
    var amount = event.key === "PageDown" || event.key === "PageUp" || event.key === " " ?
      SCRUB_PAGE_KEY_STEP :
      SCRUB_KEY_STEP;

    return direction * amount;
  }

  function updateFinalScrubRatio(progressDelta, direction) {
    finalScrubRatio = clamp(finalScrubRatio + progressDelta, 0, 1);

    if (finalScrubRatio <= 0 && direction < 0) {
      exitFinalScrub();
      return;
    }

    applyFinalScrubPosition();
    scheduleFinalScrubUpdate();
  }

  function stopInput(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function getRawDirection(delta) {
    if (delta === 0) {
      return 0;
    }

    return delta > 0 ? 1 : -1;
  }

  function getDirection(delta) {
    if (Math.abs(delta) < WHEEL_TRIGGER_DELTA) {
      return 0;
    }

    return delta > 0 ? 1 : -1;
  }

  function canMove(direction) {
    syncCurrentStateFromViewport();

    if (direction > 0 && currentState >= FINAL_STATE_INDEX) {
      return false;
    }

    if (direction < 0 && currentState <= 0) {
      return false;
    }

    return isTargetReadable(targets[currentState]);
  }

  function isFinalForwardInput(direction) {
    syncCurrentStateFromViewport();
    return direction > 0 && currentState >= FINAL_STATE_INDEX && isTargetReadable(targets[currentState]);
  }

  function isFinalStateActive() {
    return currentState >= FINAL_STATE_INDEX || document.body.getAttribute("data-nt-story-state") === String(FINAL_STATE_INDEX);
  }

  function isTargetReadable(target) {
    if (!target) {
      return false;
    }

    var rect = target.getBoundingClientRect();
    var readLine = window.innerHeight * 0.42;
    return rect.top <= readLine && rect.bottom >= readLine;
  }

  function setupStateSync() {
    var ticking = false;

    window.addEventListener("scroll", function () {
      if (inputLocked || finalScrubActive) {
        window.requestAnimationFrame(function () {
          forceScrollTo(lockedScrollY);
        });
        return;
      }

      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(function () {
        syncCurrentStateFromViewport();
        ticking = false;
      });
    }, { passive: true });
  }

  function syncCurrentStateFromViewport() {
    // Once committed to the frozen final frame, never let a viewport re-scan demote
    // it. Reverse navigation is handled explicitly by the scroll-scrub controller.
    if (currentState === FINAL_STATE_INDEX) {
      return;
    }

    var bestState = currentState;
    var bestDistance = Infinity;
    var anchor = window.innerHeight * 0.42;

    targets.forEach(function (target, index) {
      var rect = target.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        return;
      }

      var distance = Math.abs(rect.top - anchor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestState = index;
      }
    });

    if (bestState !== currentState) {
      currentState = bestState;
      setVisualForState(currentState);
    }
  }

  function beginTransition(toState) {
    var transition = createTransition(toState);

    if (!transition || inputLocked) {
      return;
    }

    if (transition.finalScrub) {
      activateFinalScrub(transition);
      return;
    }

    activeTransition = transition;
    inputLocked = true;
    lockStoryScroll(transition.fromState);
    preloadAround(transition.toState);

    prepareTransition(transition)
      .then(function (prepared) {
        if (activeTransition !== transition) {
          destroyVideo(prepared.video);
          return;
        }

        playTransition(transition, prepared.video);
      })
      .catch(function (error) {
        window.console.warn("Story transition was cancelled because media was not ready.", error);
        cancelTransition();
      });
  }

  function createTransition(toState) {
    if (toState < 0 || toState >= states.length || toState === currentState) {
      return null;
    }

    var direction = toState > currentState ? 1 : -1;
    var edge = edges[Math.min(currentState, toState)];

    if (currentState === SCRUB_START_STATE_INDEX && direction > 0) {
      return createFinalScrubTransition(direction);
    }

    if (!edge || Math.abs(toState - currentState) !== 1) {
      return null;
    }

    return {
      fromState: currentState,
      toState: toState,
      direction: direction,
      video: null,
      destinationImage: getStateImage(toState),
      finalScrub: direction > 0 && toState === FINAL_STATE_INDEX
    };
  }

  function createFinalScrubTransition(direction) {
    return {
      fromState: SCRUB_START_STATE_INDEX,
      toState: FINAL_STATE_INDEX,
      direction: direction || 1,
      video: null,
      destinationImage: getStateImage(FINAL_STATE_INDEX),
      finalScrub: true
    };
  }

  function prepareTransition(transition) {
    var imageReady = ensureImageReady(transition.destinationImage);

    if (reducedMotion) {
      return imageReady.then(function () {
        return { video: null };
      });
    }

    if (transition.finalScrub || !transition.video) {
      return imageReady.then(function () {
        return { video: null };
      });
    }

    return Promise.all([
      prepareVideo(transition.video),
      imageReady
    ]).then(function (results) {
      return { video: results[0] };
    });
  }

  function playTransition(transition, video) {
    if (transition.finalScrub) {
      activateFinalScrub(transition);
      return;
    }

    if (reducedMotion) {
      commitTransition(transition, null);
      return;
    }

    if (!video) {
      playStillTransition(transition);
      return;
    }

    var duration = getTransitionDuration(video);

    video.defaultPlaybackRate = VIDEO_PLAYBACK_RATE;
    video.playbackRate = VIDEO_PLAYBACK_RATE;
    video.classList.add("nt-story-transition-video");
    video.setAttribute("data-active-transition", "true");
    video.onended = function () {
      commitTransition(transition, video);
    };
    video.onerror = function () {
      commitTransition(transition, video);
    };

    transitionLayer.style.setProperty("--nt-transition-duration", duration + "ms");
    transitionLayer.toggleAttribute("data-final-scrub", transition.finalScrub);
    applyHeroThreadAnchor(transition);

    transitionLayer.replaceChildren(video);
    mountTransitionText(transition, video);

    transitionLayer.classList.add("is-visible");
    document.body.classList.add("nt-story-video-active");

    var playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () {
        commitTransition(transition, video);
      });
    }
  }

  function playStillTransition(transition) {
    var duration = SCRUB_TRANSITION_DURATION_MS;

    transitionLayer.style.setProperty("--nt-transition-duration", duration + "ms");
    transitionLayer.removeAttribute("data-final-scrub");
    transitionLayer.removeAttribute("data-scroll-scrub");
    applyHeroThreadAnchor(transition);
    transitionLayer.replaceChildren(createTransitionUnderlay(transition));
    mountTransitionText(transition, duration);
    transitionLayer.classList.add("is-visible");
    document.body.classList.add("nt-story-video-active");

    window.setTimeout(function () {
      commitTransition(transition, null);
    }, duration);
  }

  function activateFinalScrub(transition, initialRatio) {
    if (!transition || !finalScrubVideo || finalScrubVideoFailed) {
      return;
    }

    if (typeof initialRatio === "number") {
      finalScrubRatio = clamp(initialRatio, 0, 1);
      finalScrubDisplayRatio = finalScrubRatio;
    }

    finalScrubTransition = transition;
    activeTransition = transition;
    finalScrubActive = true;
    inputLocked = false;
    lockStoryScroll(SCRUB_START_STATE_INDEX);
    inputLocked = false;

    ensureFinalScrubVideoReady();
    warmFinalScrubVideo();
    if (finalScrubVideo.readyState >= 2) {
      finalScrubVideo.pause();
    }
    clearWaterEffect();
    primeFinalScrubVideoToRatio(finalScrubDisplayRatio);
    restoreFinalScrubVideoToHero();
    finalScrubVideo.setAttribute("data-active-transition", "true");

    transitionLayer.style.setProperty("--nt-transition-duration", SCRUB_TRANSITION_DURATION_MS + "ms");
    transitionLayer.removeAttribute("data-final-scrub");
    transitionLayer.setAttribute("data-scroll-scrub", "");
    applyHeroThreadAnchor(transition);

    if (!transitionLayer.querySelector(".nt-story-copy-rail")) {
      transitionLayer.replaceChildren();
      mountTransitionText(transition, SCRUB_TRANSITION_DURATION_MS);
      var thread = transitionLayer.querySelector(".nt-story-copy-thread");
      if (thread) {
        thread.classList.add("is-scrubbed");
      }
    }

    transitionLayer.classList.add("is-visible");
    document.body.classList.add("nt-story-video-active");
    document.body.classList.add("nt-story-scroll-scrub-active");
    updateFinalScrubThread(finalScrubDisplayRatio);
    scheduleFinalScrubUpdate();
  }

  function exitFinalScrub() {
    if (!finalScrubActive) {
      return;
    }

    finalScrubActive = false;
    finalScrubTransition = null;
    activeTransition = null;
    finalScrubRatio = 0;
    finalScrubDisplayRatio = 0;

    if (finalScrubVideo) {
      finalScrubVideo.pause();
      finalScrubVideo.removeAttribute("data-active-transition");
      seekFinalScrubVideo(0, "reset");
    }

    restoreFinalScrubVideoToHero();
    transitionLayer.classList.remove("is-visible");
    transitionLayer.removeAttribute("data-scroll-scrub");
    transitionLayer.replaceChildren();
    transitionLayer.style.removeProperty("--nt-transition-duration");
    clearHeroThreadAnchor();
    document.body.classList.remove("nt-story-video-active");
    document.body.classList.remove("nt-story-scroll-scrub-active");
    currentState = SCRUB_START_STATE_INDEX;
    setVisualForState(currentState);
    scrollToState(currentState);
    unlockStoryScroll();
  }

  function updateFinalScrubThread(progress) {
    var thread = transitionLayer ? transitionLayer.querySelector(".nt-story-copy-thread.is-scrubbed") : null;
    var transition = finalScrubTransition;
    var fromState = transition ? transition.fromState : SCRUB_START_STATE_INDEX;
    var toState = transition ? transition.toState : FINAL_STATE_INDEX;
    var y = -((fromState + ((toState - fromState) * clamp(progress, 0, 1))) * 100);

    if (thread) {
      thread.style.transform = "translate3d(0, " + y + "vh, 0)";
    }
  }

  function syncFinalScrubStoryState(progress) {
    var clampedProgress = clamp(progress, 0, 1);

    if (clampedProgress >= 1 - FINAL_SCRUB_SETTLE_EPSILON) {
      if (currentState !== FINAL_STATE_INDEX) {
        currentState = FINAL_STATE_INDEX;
        setVisualForState(FINAL_STATE_INDEX);
      }
      lockedScrollY = getStateScrollY(FINAL_STATE_INDEX);
      forceScrollTo(lockedScrollY);
      return;
    }

    if (currentState !== SCRUB_START_STATE_INDEX) {
      currentState = SCRUB_START_STATE_INDEX;
      setVisualForState(currentState);
    }
    lockedScrollY = getStateScrollY(currentState);
    forceScrollTo(lockedScrollY);
  }

  function getTransitionDuration(video) {
    if (video && isFinite(video.duration) && video.duration > 0) {
      return Math.max(900, Math.round((video.duration / VIDEO_PLAYBACK_RATE) * 1000));
    }

    return 1400;
  }

  function createTransitionUnderlay(transition) {
    var image = document.createElement("img");

    image.className = "nt-story-transition-underlay";
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.src = getStateImage(transition.fromState);

    return image;
  }

  function applyHeroThreadAnchor(transition) {
    var anchor;
    var titleStyles;

    clearHeroThreadAnchor();

    if (!heroSection || transition.fromState !== 0) {
      return;
    }

    anchor = syncHeroCopyAnchor();
    if (!anchor) {
      return;
    }

    titleStyles = window.getComputedStyle(anchor.titleSample);
    transitionLayer.setAttribute("data-from-hero", "true");
    transitionLayer.style.setProperty("--nt-hero-copy-left", anchor.left + "px");
    transitionLayer.style.setProperty("--nt-hero-copy-top", anchor.top + "px");
    transitionLayer.style.setProperty("--nt-hero-copy-width", anchor.width + "px");
    transitionLayer.style.setProperty("--nt-hero-title-font-family", titleStyles.fontFamily);
    transitionLayer.style.setProperty("--nt-hero-title-font-size", titleStyles.fontSize);
    transitionLayer.style.setProperty("--nt-hero-title-font-weight", titleStyles.fontWeight);
    transitionLayer.style.setProperty("--nt-hero-title-line-height", titleStyles.lineHeight);
  }

  function syncHeroCopyAnchor() {
    var titleWrapper;
    var titleSample;
    var rect;
    var wrapperStyles;
    var paddingLeft;
    var left;
    var top;
    var width;

    if (!heroSection) {
      return null;
    }

    titleWrapper = heroSection.querySelector(".title-wrapper.is-hero");
    titleSample = heroSection.querySelector(".title-wrapper.is-hero .hero-title");

    if (!titleWrapper || !titleSample) {
      return null;
    }

    rect = titleWrapper.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    wrapperStyles = window.getComputedStyle(titleWrapper);
    paddingLeft = parseFloat(wrapperStyles.paddingLeft) || 0;
    left = Math.max(0, rect.left + paddingLeft);
    top = Math.max(0, rect.top);
    width = Math.min(window.innerWidth - left, Math.max(0, rect.width - paddingLeft));
    document.body.style.setProperty("--nt-story-copy-left", left + "px");
    document.body.style.setProperty("--nt-story-copy-top", top + "px");

    return {
      left: left,
      top: top,
      width: width,
      titleSample: titleSample
    };
  }

  function clearHeroThreadAnchor() {
    if (!transitionLayer) {
      return;
    }

    transitionLayer.removeAttribute("data-from-hero");
    transitionLayer.style.removeProperty("--nt-hero-copy-left");
    transitionLayer.style.removeProperty("--nt-hero-copy-top");
    transitionLayer.style.removeProperty("--nt-hero-copy-width");
    transitionLayer.style.removeProperty("--nt-hero-title-font-family");
    transitionLayer.style.removeProperty("--nt-hero-title-font-size");
    transitionLayer.style.removeProperty("--nt-hero-title-font-weight");
    transitionLayer.style.removeProperty("--nt-hero-title-line-height");
  }

  function mountTransitionText(transition, video) {
    var overlay = document.createElement("div");
    var thread = document.createElement("div");
    var duration = typeof video === "number" ? video : getTransitionDuration(video);

    overlay.className = "nt-story-copy-rail";
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("data-direction", String(transition.direction));
    thread.className = "nt-story-copy-thread";
    thread.style.setProperty("--nt-copy-duration", duration + "ms");
    thread.style.setProperty("--nt-thread-from", "-" + (transition.fromState * 100) + "vh");
    thread.style.setProperty("--nt-thread-to", "-" + (transition.toState * 100) + "vh");

    states.forEach(function (_state, index) {
      var item = document.createElement("div");
      var isEntering = index === transition.toState;

      item.className = "nt-story-copy-thread-item";
      item.setAttribute("data-story-thread-state", String(index));
      item.setAttribute("data-story-thread-role", isEntering ? "entering" : "rail");
      item.appendChild(createStateText(index, "nt-story-thread-copy", {
        entering: isEntering,
        enterDelay: 0
      }));
      thread.appendChild(item);
    });

    overlay.appendChild(thread);
    transitionLayer.appendChild(overlay);
  }

  function createStateText(stateIndex, className, options) {
    var state = states[stateIndex] || states[0];
    var text = state.text || states[0].text;
    var settings = options || {};
    var wrap = document.createElement("div");
    var title = document.createElement("div");
    var subtitle = document.createElement("p");

    wrap.className = "nt-story-copy " + className;
    if (settings.entering) {
      wrap.className += " is-entering";
    }
    title.className = "nt-story-copy-title";

    text.title.forEach(function (line) {
      var lineNode = document.createElement("span");
      var lineText = document.createElement("span");

      lineNode.className = "nt-story-copy-line hero-title-contain" + (title.children.length ? " is-2" : "");
      lineText.className = "nt-story-copy-line-text hero-title";
      lineText.textContent = line;
      lineText.style.setProperty("--nt-line-delay", (settings.enterDelay + title.children.length * 70) + "ms");
      lineNode.appendChild(lineText);
      title.appendChild(lineNode);
    });

    subtitle.className = "nt-story-copy-subtitle";
    subtitle.textContent = text.subtitle || "";
    subtitle.style.setProperty("--nt-subtitle-delay", (settings.enterDelay + 130 + text.title.length * 70) + "ms");

    wrap.appendChild(title);
    if (text.subtitle) {
      wrap.appendChild(subtitle);
    }

    // Optional extra paragraph that lives inside the copy block, so it travels
    // with the story thread during transitions just like the title/subtitle.
    // placement "above" puts it before the headline (e.g. the right-aligned
    // Process lede); otherwise it sits beneath the subtitle (e.g. the boxed
    // Story-Led note).
    if (text.note && text.note.text) {
      var note = document.createElement("p");
      note.className = "nt-story-copy-note is-" + (text.note.variant || "boxed");
      note.textContent = text.note.text;
      note.style.setProperty("--nt-note-delay", (settings.enterDelay + 220 + text.title.length * 70) + "ms");
      if (text.note.placement === "above") {
        wrap.insertBefore(note, wrap.firstChild);
      } else {
        wrap.appendChild(note);
      }
    }

    return wrap;
  }

  function commitTransition(transition, video) {
    if (activeTransition !== transition) {
      destroyVideo(video);
      return;
    }

    currentState = transition.toState;
    primeFinalScrubFromTransition(transition);
    setVisualForState(transition.toState);
    scrollToState(transition.toState);
    preloadAround(transition.toState);

    // Instant teardown (no hold-final-frame fade) for:
    //  - reduced motion / no video (keep that experience unchanged), and
    //  - the finalScrub 3->4 transition. The footer is taken over by the primed
    //    footer scrub video (not a still to cross-fade), and the fade's ~200ms
    //    delayed unlock let the footer settle and the viewport re-scan demote the
    //    state back to Process — bouncing the user back into the previous video.
    //    Unlocking in the next frame keeps currentState pinned at FINAL.
    if (reducedMotion || !video || transition.finalScrub) {
      window.requestAnimationFrame(function () {
        finishTransition(transition, video);
      });
      return;
    }

    // Hold-final-frame handoff: the video has reached its final frame. Keep it
    // mounted and visible (paused on that frame) covering the destination, then
    // reveal the destination still beneath it with a short cross-fade instead
    // of a hard cut. Un-hiding the fixed visual now (dropping nt-story-video-active)
    // places the decoded still directly under the still-opaque video layer so
    // the fade simply dissolves the video frame into the matching still.
    video.pause();
    document.body.classList.remove("nt-story-video-active");

    whenDestinationStillReady(function () {
      if (activeTransition !== transition) {
        finishTransition(transition, video);
        return;
      }
      fadeOutTransitionLayer(function () {
        finishTransition(transition, video);
      });
    });
  }

  // Shared teardown for a committed transition: hide and clear the transition
  // layer, release the video, reset transition attributes, and unlock input.
  function finishTransition(transition, video) {
    transitionLayer.classList.remove("is-visible");
    transitionLayer.classList.remove("is-handoff");
    transitionLayer.classList.remove("is-handoff-fading");
    document.body.classList.remove("nt-story-video-active");
    destroyVideo(video);
    transitionLayer.replaceChildren();
    transitionLayer.removeAttribute("data-transition");
    transitionLayer.removeAttribute("data-final-scrub");
    transitionLayer.removeAttribute("data-from-hero");
    transitionLayer.style.removeProperty("--nt-transition-duration");
    transitionLayer.style.removeProperty("--nt-transition-fade");
    clearHeroThreadAnchor();
    activeTransition = null;
    unlockStoryScroll();
  }

  // Resolve once the destination still is decoded and painted, so the cross-fade
  // reveals a ready image rather than a blank frame. Falls back on a short
  // timeout (and on states with no fixed still) so the handoff never stalls.
  function whenDestinationStillReady(callback) {
    var settled = false;
    function go() {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    }

    var image = fixedVisualImage;
    var hasStill = image &&
      image.getAttribute("src") &&
      fixedVisualLayer &&
      fixedVisualLayer.classList.contains("is-visible");

    if (hasStill && typeof image.decode === "function") {
      image.decode().then(go).catch(go);
      window.setTimeout(go, HANDOFF_DECODE_TIMEOUT_MS);
      return;
    }

    // No destination still to wait on (hero / final state): proceed promptly.
    window.setTimeout(go, 0);
  }

  // Cross-fade the (paused, final-frame) transition layer out over ~200ms.
  // Uses a two-step class toggle so the opacity transition is registered before
  // opacity flips, and guards completion with both transitionend and a timeout.
  function fadeOutTransitionLayer(callback) {
    var done = false;
    function finish() {
      if (done) {
        return;
      }
      done = true;
      transitionLayer.removeEventListener("transitionend", onEnd);
      callback();
    }
    function onEnd(event) {
      if (event.target === transitionLayer && event.propertyName === "opacity") {
        finish();
      }
    }

    transitionLayer.style.setProperty("--nt-transition-fade", HANDOFF_FADE_MS + "ms");
    transitionLayer.classList.add("is-handoff");
    transitionLayer.addEventListener("transitionend", onEnd);
    // Force a reflow so the armed transition and the opacity:1 baseline are
    // committed before opacity flips to 0; this makes the fade fire reliably
    // without depending on requestAnimationFrame (which background tabs pause).
    void transitionLayer.offsetWidth;
    transitionLayer.classList.add("is-handoff-fading");

    window.setTimeout(finish, HANDOFF_FADE_MS + 120);
  }

  function cancelTransition() {
    transitionLayer.classList.remove("is-visible");
    transitionLayer.replaceChildren();
    transitionLayer.removeAttribute("data-final-scrub");
    transitionLayer.removeAttribute("data-from-hero");
    transitionLayer.style.removeProperty("--nt-transition-duration");
    clearHeroThreadAnchor();
    document.body.classList.remove("nt-story-video-active");
    activeTransition = null;
    setVisualForState(currentState);
    unlockStoryScroll();
  }

  function setVisualForState(state) {
    document.body.setAttribute("data-nt-story-state", String(state));
    document.body.classList.toggle("nt-story-footer-active", state === FINAL_STATE_INDEX);

    syncRestBackgrounds(state);
    scheduleFinalScrubUpdate();

    if (!fixedVisualLayer || !fixedVisualImage) {
      return;
    }

    if (state <= 0 || state === FINAL_STATE_INDEX) {
      fixedVisualLayer.classList.remove("is-visible");
      fixedVisualImage.removeAttribute("src");
      fixedVisualImage.removeAttribute("data-current-image");
      return;
    }

    var src = getStateImage(state);
    if (fixedVisualImage.getAttribute("src") !== src) {
      fixedVisualImage.src = src;
    }
    fixedVisualImage.setAttribute("data-current-image", src);
    fixedVisualLayer.classList.add("is-visible");
  }

  function syncRestBackgrounds(state) {
    var activeImage = state > 0 ? getStateImage(state) : "";
    document.body.style.setProperty("--nt-story-body-image", activeImage ? "url(\"" + activeImage + "\")" : "none");

    restSections.forEach(function (section, index) {
      var stateIndex = index + 1;
      var image = stateIndex === state ? activeImage : "";
      section.style.backgroundImage = image ? "url(\"" + image + "\")" : "";
    });

    if (state <= 0) {
      removeRestVisualImage();
      return;
    }

    var activeSection = restSections[state - 1];
    if (!activeSection || !activeImage) {
      removeRestVisualImage();
      return;
    }

    if (!restVisualImage) {
      restVisualImage = document.createElement("img");
      restVisualImage.className = "nt-story-rest-image";
      restVisualImage.alt = "";
      restVisualImage.draggable = false;
      restVisualImage.decoding = "async";
      restVisualImage.loading = "eager";
    }

    if (restVisualImage.getAttribute("src") !== activeImage) {
      restVisualImage.src = activeImage;
    }

    if (restVisualImage.parentElement !== activeSection) {
      activeSection.insertBefore(restVisualImage, activeSection.firstChild);
    }
  }

  function removeRestVisualImage() {
    if (restVisualImage && restVisualImage.parentElement) {
      restVisualImage.remove();
    }
  }

  function primeFinalScrubFromTransition(transition) {
    if (!transition.finalScrub || !finalScrubVideo || !isVideoDurationReady(finalScrubVideo)) {
      return;
    }

    finalScrubRatio = 1;
    finalScrubDisplayRatio = 1;
    finalScrubVideo.pause();

    try {
      finalScrubVideo.currentTime = Math.min(SCRUB_END_TIME, finalScrubVideo.duration);
    } catch (error) {
      window.console.warn("Footer scrub video could not be primed after transition.", error);
    }
  }

  function preloadAround(state) {
    [state - 1, state, state + 1].forEach(function (stateIndex) {
      ensureImageReady(getStateImage(stateIndex));
    });

    if (state >= FINAL_STATE_INDEX - 1) {
      preloadVideo(FINAL_SCRUB_VIDEO);
    }
  }

  function preloadAllMedia() {
    states.forEach(function (_state, stateIndex) {
      ensureImageReady(getStateImage(stateIndex));
    });
    preloadVideo(FINAL_SCRUB_VIDEO);
  }

  function preloadVideo(src) {
    if (!src || videoPreloadLinks[src]) {
      return;
    }

    var link = document.createElement("link");
    link.rel = "preload";
    link.as = "video";
    link.href = src;
    link.type = "video/mp4";
    document.head.appendChild(link);
    videoPreloadLinks[src] = link;
  }

  function prepareVideo(src) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement("video");
      var loadedData = false;
      var canPlay = false;
      var settled = false;

      function cleanup() {
        video.removeEventListener("loadeddata", handleLoadedData);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("error", handleError);
      }

      function resolveIfReady() {
        if (settled || !loadedData || !canPlay) {
          return;
        }

        settled = true;
        cleanup();
        try {
          video.currentTime = 0;
        } catch (error) {
          video.load();
        }
        video.defaultPlaybackRate = VIDEO_PLAYBACK_RATE;
        video.playbackRate = VIDEO_PLAYBACK_RATE;
        resolve(video);
      }

      function handleLoadedData() {
        loadedData = true;
        resolveIfReady();
      }

      function handleCanPlay() {
        canPlay = true;
        resolveIfReady();
      }

      function handleError() {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(video.error || new Error("Video failed to load: " + src));
      }

      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.defaultPlaybackRate = VIDEO_PLAYBACK_RATE;
      video.playbackRate = VIDEO_PLAYBACK_RATE;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("preload", "auto");
      video.addEventListener("loadeddata", handleLoadedData);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("error", handleError);
      video.src = src;
      video.load();

      if (video.readyState >= 2) {
        loadedData = true;
      }

      if (video.readyState >= 3) {
        canPlay = true;
      }

      resolveIfReady();
    });
  }

  function ensureImageReady(src) {
    if (!src) {
      return Promise.resolve();
    }

    if (imageReadyPromises[src]) {
      return imageReadyPromises[src];
    }

    imageReadyPromises[src] = new Promise(function (resolve, reject) {
      var image = new Image();

      function resolveLoaded() {
        resolve(src);
      }

      function rejectFailed() {
        reject(new Error("Image failed to load: " + src));
      }

      image.decoding = "async";
      image.onload = resolveLoaded;
      image.onerror = rejectFailed;
      image.src = src;

      if (image.decode) {
        image.decode().then(resolveLoaded).catch(function () {
          if (image.complete && image.naturalWidth > 0) {
            resolveLoaded();
          }
        });
      } else if (image.complete && image.naturalWidth > 0) {
        resolveLoaded();
      }
    });

    return imageReadyPromises[src];
  }

  function ensureFinalScrubVideoReady() {
    if (!finalScrubVideo || finalScrubVideoReady || finalScrubVideoFailed) {
      return Promise.resolve(finalScrubVideo);
    }

    if (!finalScrubReadyPromise) {
      finalScrubReadyPromise = new Promise(function (resolve) {
        finalScrubResolve = resolve;
      });
    }

    markFinalScrubVideoReady();
    return finalScrubReadyPromise;
  }

  function markFinalScrubVideoReady() {
    if (!finalScrubVideo || finalScrubVideoReady || finalScrubVideoFailed || !isVideoDurationReady(finalScrubVideo) || finalScrubVideo.readyState < 2) {
      return;
    }

    if (finalScrubVideo.duration < SCRUB_END_TIME) {
      finalScrubVideoFailed = true;
      window.console.error("Atom 2.0 scroll scrub video is shorter than the required 13 second scrub end.", {
        duration: finalScrubVideo.duration,
        requiredDuration: SCRUB_END_TIME
      });
      return;
    }

    finalScrubVideoReady = true;
    finalScrubVideo.pause();
    primeFinalScrubVideoToRatio(finalScrubActive ? finalScrubDisplayRatio : 0);
    document.body.classList.add("nt-story-footer-scrub-ready");
    scheduleFinalScrubUpdate();

    if (finalScrubResolve) {
      finalScrubResolve(finalScrubVideo);
      finalScrubResolve = null;
    }
  }

  function markFinalScrubVideoFailed() {
    finalScrubVideoFailed = true;

    if (finalScrubResolve) {
      finalScrubResolve(null);
      finalScrubResolve = null;
    }
  }

  function scheduleFinalScrubUpdate() {
    if (finalScrubFrame) {
      return;
    }

    finalScrubFrame = window.requestAnimationFrame(function () {
      finalScrubFrame = 0;
      if (applyFinalScrubPosition()) {
        scheduleFinalScrubUpdate();
      }
    });
  }

  function applyFinalScrubPosition() {
    if (!finalScrubActive || !finalScrubVideo || !isVideoDurationReady(finalScrubVideo)) {
      return false;
    }

    if (finalScrubVideo.duration < SCRUB_END_TIME) {
      if (!finalScrubDurationWarned) {
        finalScrubDurationWarned = true;
        window.console.error("Atom 2.0 scroll scrub video cannot scrub to 13 seconds because metadata reports a shorter duration.", {
          duration: finalScrubVideo.duration,
          requiredDuration: SCRUB_END_TIME
        });
      }
      return false;
    }

    var endTime = SCRUB_END_TIME;
    finalScrubDisplayRatio = finalScrubRatio;

    var rawTime = clamp(finalScrubDisplayRatio, 0, 1) * endTime;
    var frameDuration = 1 / FINAL_SCRUB_FPS;
    var targetTime = clamp(Math.round(rawTime / frameDuration) * frameDuration, 0, endTime);
    if (finalScrubDisplayRatio >= 1 - FINAL_SCRUB_SETTLE_EPSILON) {
      targetTime = endTime;
    }

    if (!finalScrubVideo.paused) {
      finalScrubVideo.pause();
    }

    updateFinalScrubThread(finalScrubDisplayRatio);
    syncFinalScrubStoryState(finalScrubDisplayRatio);
    finalScrubVideo.setAttribute("data-scrub-ratio", finalScrubDisplayRatio.toFixed(4));
    finalScrubVideo.setAttribute("data-scrub-time", targetTime.toFixed(3));

    if (Math.abs(finalScrubVideo.currentTime - targetTime) < FINAL_SCRUB_SEEK_EPSILON) {
      return Math.abs(finalScrubRatio - finalScrubDisplayRatio) > FINAL_SCRUB_SETTLE_EPSILON;
    }

    seekFinalScrubVideo(targetTime, "scrub");

    return Math.abs(finalScrubRatio - finalScrubDisplayRatio) > FINAL_SCRUB_SETTLE_EPSILON;
  }

  function primeFinalScrubVideoToRatio(ratio) {
    if (!finalScrubVideo || !isVideoDurationReady(finalScrubVideo)) {
      return;
    }

    var endTime = Math.min(SCRUB_END_TIME, finalScrubVideo.duration);
    var targetTime = clamp(ratio || 0, 0, 1) * endTime;

    if (Math.abs(finalScrubVideo.currentTime - targetTime) < FINAL_SCRUB_SEEK_EPSILON) {
      return;
    }

    seekFinalScrubVideo(targetTime, "prime");
  }

  function restoreFinalScrubVideoToHero() {
    if (!heroStaticLayer || !finalScrubVideo) {
      return;
    }

    finalScrubVideo.classList.remove("nt-story-transition-video");
    finalScrubVideo.classList.add("nt-story-hero-video");

    if (finalScrubVideo.parentElement === heroStaticLayer) {
      return;
    }

    heroStaticLayer.appendChild(finalScrubVideo);
  }

  function seekFinalScrubVideo(targetTime, context) {
    if (!finalScrubVideo) {
      return;
    }

    try {
      finalScrubVideo.currentTime = targetTime;
    } catch (error) {
      window.console.warn("Scroll scrub video could not seek during " + context + ".", error);
    }
  }

  function warmFinalScrubVideo() {
    if (!finalScrubVideo || finalScrubVideoFailed) {
      return;
    }

    if (finalScrubWarmStarted || finalScrubVideo.readyState >= 2 && isVideoDurationReady(finalScrubVideo)) {
      return;
    }

    try {
      finalScrubWarmStarted = true;
      finalScrubVideo.removeAttribute("data-play-error");
      finalScrubVideo.load();
      var playPromise = finalScrubVideo.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(function () {
          finalScrubWarmStarted = false;
          finalScrubVideo.pause();
          primeFinalScrubVideoToRatio(finalScrubActive ? finalScrubDisplayRatio : 0);
        }).catch(function () {
          finalScrubWarmStarted = false;
          finalScrubVideo.pause();
        });
      } else {
        finalScrubWarmStarted = false;
        finalScrubVideo.pause();
      }
    } catch (error) {
      finalScrubWarmStarted = false;
      finalScrubVideo.pause();
    }
  }

  function requestFinalScrubVideo() {
    if (!finalScrubVideo || finalScrubVideoReady || finalScrubFetchStarted || typeof window.fetch !== "function") {
      return;
    }

    finalScrubFetchStarted = true;
    window.fetch(FINAL_SCRUB_VIDEO)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Video request failed with status " + response.status);
        }
        return response.arrayBuffer();
      })
      .then(function () {
        if (!finalScrubVideo || finalScrubVideoReady) {
          return;
        }

        finalScrubVideo.src = FINAL_SCRUB_VIDEO;
        finalScrubVideo.load();
        warmFinalScrubVideo();
      })
      .catch(function () {
        finalScrubFetchStarted = false;
        if (finalScrubVideo && !finalScrubVideoReady) {
          finalScrubVideo.src = FINAL_SCRUB_VIDEO;
          finalScrubVideo.load();
        }
      });
  }

  function isVideoDurationReady(video) {
    return video && isFinite(video.duration) && video.duration > 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function destroyVideo(video) {
    if (!video) {
      return;
    }

    video.pause();
    video.removeAttribute("data-active-transition");
    video.removeAttribute("src");
    video.load();
    video.remove();
  }

  function getStateImage(state) {
    if (state <= 0) {
      return getHeroImageSource();
    }

    return states[state] ? states[state].image : "";
  }

  function getHeroImageSource() {
    return HERO_BASE_IMAGE;
  }

  function lockStoryScroll(state) {
    lockedScrollY = getStateScrollY(state);
    document.documentElement.classList.add("nt-story-lock");
    document.body.classList.add("nt-story-transitioning");

    if (window.__nomadaToastLenis && typeof window.__nomadaToastLenis.stop === "function") {
      window.__nomadaToastLenis.stop();
    }

    forceScrollTo(lockedScrollY);
  }

  function unlockStoryScroll() {
    inputLocked = false;
    document.documentElement.classList.remove("nt-story-lock");
    document.body.classList.remove("nt-story-transitioning");

    if (window.__nomadaToastLenis && typeof window.__nomadaToastLenis.start === "function") {
      window.__nomadaToastLenis.start();
    }

    syncCurrentStateFromViewport();
  }

  function scrollToState(state) {
    forceScrollTo(getStateScrollY(state));
  }

  function getStateScrollY(state) {
    var target = targets[state];

    if (!target) {
      return 0;
    }

    var targetTop = target.getBoundingClientRect().top + window.pageYOffset;

    if (state === FINAL_STATE_INDEX) {
      return targetTop + Math.max(0, target.offsetHeight - window.innerHeight);
    }

    return targetTop;
  }

  function forceScrollTo(y) {
    lockedScrollY = y;

    if (window.__nomadaToastLenis && typeof window.__nomadaToastLenis.scrollTo === "function") {
      window.__nomadaToastLenis.scrollTo(y, { immediate: true });
    }

    window.scrollTo({ top: y, behavior: "auto" });
    document.documentElement.scrollTop = y;
    document.body.scrollTop = y;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStoryFlow);
  } else {
    initStoryFlow();
  }
})();
