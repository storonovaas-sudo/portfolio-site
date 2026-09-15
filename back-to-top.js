const backToTopButtons = document.querySelectorAll(".back-to-top");
const contactMenus = document.querySelectorAll(".contact-menu");
const likeButtons = document.querySelectorAll(".like-button");
const caseImages = document.querySelectorAll(".hero-visual > img, .artifact-card > img");

const updateBackToTop = () => {
  const isVisible = window.scrollY > window.innerHeight * 0.8;

  backToTopButtons.forEach((button) => {
    button.classList.toggle("is-visible", isVisible);
    button.setAttribute("aria-hidden", String(!isVisible));
    button.tabIndex = isVisible ? 0 : -1;
  });
};

backToTopButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

updateBackToTop();
window.addEventListener("scroll", updateBackToTop, { passive: true });
window.addEventListener("resize", updateBackToTop);

document.addEventListener("click", (event) => {
  contactMenus.forEach((menu) => {
    if (menu.open && !menu.contains(event.target)) {
      menu.open = false;
    }
  });
});

likeButtons.forEach((button) => {
  const key = `portfolioLike:${button.dataset.likeKey || window.location.pathname}`;
  const likedKey = `${key}:liked`;
  const countNode = button.querySelector(".like-button__count");
  let storedValue = "0";
  let storedLiked = "false";

  try {
    storedValue = window.localStorage.getItem(key) || "0";
    storedLiked = window.localStorage.getItem(likedKey) || "false";
  } catch {
    storedValue = "0";
    storedLiked = "false";
  }

  const savedCount = Number.parseInt(storedValue, 10);
  let count = Number.isFinite(savedCount) ? savedCount : 0;
  let isLiked = storedLiked === "true";

  if (countNode) {
    countNode.textContent = String(count);
  }

  button.classList.toggle("is-liked", isLiked);
  button.setAttribute("aria-pressed", String(isLiked));

  button.addEventListener("click", () => {
    isLiked = !isLiked;
    count = Math.max(0, count + (isLiked ? 1 : -1));

    try {
      window.localStorage.setItem(key, String(count));
      window.localStorage.setItem(likedKey, String(isLiked));
    } catch {
      // Keep the visible count updated even when storage is unavailable.
    }

    button.classList.toggle("is-liked", isLiked);
    button.setAttribute("aria-pressed", String(isLiked));

    if (countNode) {
      countNode.textContent = String(count);
    }
  });
});

if (caseImages.length) {
  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Просмотр изображения");
  lightbox.innerHTML = `
    <button class="image-lightbox__close" type="button" aria-label="Закрыть изображение">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </svg>
    </button>
    <img class="image-lightbox__image" alt="" />
    <div class="image-lightbox__zoom" aria-label="Масштаб изображения">
      <button class="image-lightbox__zoom-button" type="button" data-zoom-action="out" aria-label="Уменьшить масштаб">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span class="image-lightbox__zoom-value">100 %</span>
      <button class="image-lightbox__zoom-button" type="button" data-zoom-action="in" aria-label="Увеличить масштаб">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(lightbox);

  const lightboxImage = lightbox.querySelector(".image-lightbox__image");
  const lightboxClose = lightbox.querySelector(".image-lightbox__close");
  const zoomControls = lightbox.querySelector(".image-lightbox__zoom");
  const zoomValue = lightbox.querySelector(".image-lightbox__zoom-value");
  const zoomButtons = lightbox.querySelectorAll(".image-lightbox__zoom-button");
  const minZoom = 0.5;
  const maxZoom = 3;
  const zoomStep = 0.25;
  let imageZoom = 1;
  let panX = 0;
  let panY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let isDraggingImage = false;

  const updateImageZoom = () => {
    lightboxImage.style.setProperty("--image-zoom", imageZoom);
    lightboxImage.style.setProperty("--image-x", `${panX}px`);
    lightboxImage.style.setProperty("--image-y", `${panY}px`);
    lightboxImage.classList.toggle("is-pannable", imageZoom > 1);
    zoomValue.textContent = `${Math.round(imageZoom * 100)} %`;

    zoomButtons.forEach((button) => {
      const action = button.dataset.zoomAction;
      button.disabled = action === "out" ? imageZoom <= minZoom : imageZoom >= maxZoom;
    });
  };

  const closeLightbox = () => {
    lightbox.classList.remove("is-open");
    document.body.classList.remove("has-image-lightbox");
  };

  const openLightbox = (image) => {
    imageZoom = 1;
    panX = 0;
    panY = 0;
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "";
    updateImageZoom();
    lightbox.classList.add("is-open");
    document.body.classList.add("has-image-lightbox");
    lightboxClose.focus();
  };

  caseImages.forEach((image) => {
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", image.alt ? `Открыть изображение: ${image.alt}` : "Открыть изображение");

    image.addEventListener("click", () => openLightbox(image));
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(image);
      }
    });
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  lightboxClose.addEventListener("click", closeLightbox);
  lightboxImage.addEventListener("click", () => {
    if (imageZoom <= 1) {
      closeLightbox();
    }
  });

  zoomControls.addEventListener("click", (event) => {
    event.stopPropagation();

    const button = event.target.closest(".image-lightbox__zoom-button");

    if (!button) {
      return;
    }

    const direction = button.dataset.zoomAction === "out" ? -1 : 1;
    imageZoom = Math.min(maxZoom, Math.max(minZoom, imageZoom + direction * zoomStep));

    if (imageZoom <= 1) {
      panX = 0;
      panY = 0;
    }

    updateImageZoom();
  });

  lightboxImage.addEventListener("pointerdown", (event) => {
    if (imageZoom <= 1) {
      return;
    }

    event.preventDefault();
    isDraggingImage = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    startPanX = panX;
    startPanY = panY;
    lightboxImage.classList.add("is-dragging");
    lightboxImage.setPointerCapture(event.pointerId);
  });

  lightboxImage.addEventListener("pointermove", (event) => {
    if (!isDraggingImage) {
      return;
    }

    panX = startPanX + event.clientX - dragStartX;
    panY = startPanY + event.clientY - dragStartY;
    updateImageZoom();
  });

  const stopImageDrag = (event) => {
    if (!isDraggingImage) {
      return;
    }

    isDraggingImage = false;
    lightboxImage.classList.remove("is-dragging");

    if (lightboxImage.hasPointerCapture(event.pointerId)) {
      lightboxImage.releasePointerCapture(event.pointerId);
    }
  };

  lightboxImage.addEventListener("pointerup", stopImageDrag);
  lightboxImage.addEventListener("pointercancel", stopImageDrag);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
      closeLightbox();
    }
  });
}
