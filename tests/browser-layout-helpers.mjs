import assert from "node:assert/strict";

const GEOMETRY_TOLERANCE = 1.5;
const CALENDAR_EDGE_TOLERANCE = 0.125;

function assertClose(actual, expected, message, tolerance = GEOMETRY_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} (attendu ${expected.toFixed(2)}, reçu ${actual.toFixed(2)}).`
  );
}

/**
 * Vérifie le contrat commun des fenêtres de l'application : le voile et la
 * carte vivent dans le centre, sans jamais empiéter sur le rail ni le panneau IA.
 */
export async function assertDialogConfinedToWorkspace(page, dialog, label) {
  await dialog.waitFor({ state: "visible" });
  await dialog.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  const geometry = await dialog.evaluate((element) => {
    const backdrop = element.closest(".modal-backdrop");
    const modalRoot = element.closest(".workspace-modal-root");
    const workspace = document.querySelector(".main-workspace");
    const rail = document.querySelector(".app-rail");
    const aiPane = document.querySelector(".ai-pane.is-visible");
    const rect = (node) => {
      if (!node) return null;
      const bounds = node.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height
      };
    };

    return {
      backdrop: rect(backdrop),
      dialog: rect(element),
      workspace: rect(workspace),
      rail: rect(rail),
      aiPane: rect(aiPane),
      backdropClassName: backdrop?.className ?? "",
      workspaceContainsBackdrop: Boolean(workspace && backdrop && workspace.contains(backdrop)),
      modalRootContainsBackdrop: Boolean(modalRoot && backdrop && modalRoot.contains(backdrop))
    };
  });

  assert.ok(geometry.workspace, `${label} : la zone centrale doit être rendue.`);
  assert.ok(geometry.backdrop, `${label} : le voile de fenêtre doit être rendu.`);
  assert.ok(geometry.dialog, `${label} : la carte de fenêtre doit être mesurable.`);
  assert.match(
    geometry.backdropClassName,
    /(?:^|\s)modal-backdrop--workspace(?:\s|$)/,
    `${label} : le voile doit utiliser la portée workspace.`
  );
  assert.equal(
    geometry.workspaceContainsBackdrop,
    true,
    `${label} : le voile doit être un descendant du centre.`
  );
  assert.equal(
    geometry.modalRootContainsBackdrop,
    true,
    `${label} : le voile doit être rendu dans la racine de fenêtres du centre.`
  );

  assertClose(geometry.backdrop.left, geometry.workspace.left, `${label} : bord gauche du voile`);
  assertClose(geometry.backdrop.right, geometry.workspace.right, `${label} : bord droit du voile`);
  assertClose(geometry.backdrop.top, geometry.workspace.top, `${label} : bord supérieur du voile`);
  assertClose(geometry.backdrop.bottom, geometry.workspace.bottom, `${label} : bord inférieur du voile`);

  if (geometry.rail) {
    assert.ok(
      geometry.backdrop.left >= geometry.rail.right - GEOMETRY_TOLERANCE,
      `${label} : le voile ne doit pas recouvrir le rail gauche.`
    );
  }
  if (geometry.aiPane) {
    assert.ok(
      geometry.backdrop.right <= geometry.aiPane.left + GEOMETRY_TOLERANCE,
      `${label} : le voile ne doit pas recouvrir le panneau IA.`
    );
  }

  assert.ok(
    geometry.dialog.left >= geometry.workspace.left - GEOMETRY_TOLERANCE &&
      geometry.dialog.right <= geometry.workspace.right + GEOMETRY_TOLERANCE &&
      geometry.dialog.top >= geometry.workspace.top - GEOMETRY_TOLERANCE &&
      geometry.dialog.bottom <= geometry.workspace.bottom + GEOMETRY_TOLERANCE,
    `${label} : la carte doit rester entièrement dans la zone centrale.`
  );
}

/** Vérifie qu'un menu flottant central reste visuellement dans le workspace. */
export async function assertFloatingElementConfinedToWorkspace(page, element, label) {
  await element.waitFor({ state: "visible" });
  const geometry = await element.evaluate((node) => {
    const workspace = document.querySelector(".main-workspace");
    const modalRoot = document.querySelector(".workspace-modal-root");
    if (!workspace) return null;
    const bounds = node.getBoundingClientRect();
    const workspaceBounds = workspace.getBoundingClientRect();
    return {
      element: {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left
      },
      workspace: {
        top: workspaceBounds.top,
        right: workspaceBounds.right,
        bottom: workspaceBounds.bottom,
        left: workspaceBounds.left
      },
      workspaceContainsElement: workspace.contains(node),
      modalRootContainsElement: Boolean(modalRoot?.contains(node))
    };
  });

  assert.ok(geometry, `${label} : la zone centrale doit être rendue.`);
  assert.equal(
    geometry.workspaceContainsElement,
    true,
    `${label} doit être rendu comme descendant de la zone centrale.`
  );
  assert.equal(
    geometry.modalRootContainsElement,
    true,
    `${label} doit être rendu dans la racine de fenêtres du centre.`
  );
  assert.ok(
    geometry.element.left >= geometry.workspace.left - GEOMETRY_TOLERANCE &&
      geometry.element.right <= geometry.workspace.right + GEOMETRY_TOLERANCE &&
      geometry.element.top >= geometry.workspace.top - GEOMETRY_TOLERANCE &&
      geometry.element.bottom <= geometry.workspace.bottom + GEOMETRY_TOLERANCE,
    `${label} doit rester entièrement dans la zone centrale.`
  );
}

/**
 * Contrôle l'alignement des trois grilles de la vue Semaine ainsi que le
 * libellé Journée, avec des mesures relatives plutôt que des largeurs figées.
 */
export async function assertWeekCalendarGeometry(page, label) {
  const calendar = page.locator(".time-calendar:not(.is-day)");
  await calendar.waitFor({ state: "visible" });

  // Chromium headless masque normalement la largeur de la barre verticale
  // avec une scrollbar overlay. La WebView macOS peut au contraire lui
  // réserver de la place, ce qui réduit seulement la grille horaire et crée
  // une dérive progressive invisible dans le navigateur de CI. Ce mode rend
  // cette contrainte déterministe aux deux largeurs testées.
  await calendar.locator(".time-scroll").evaluate((element) => {
    element.style.scrollbarGutter = "stable";
    element.scrollLeft = 0;
  });
  await calendar.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  const geometry = await calendar.evaluate((element) => {
    const rect = (node) => {
      if (!node) return null;
      const bounds = node.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height
      };
    };
    const rects = (selector) => Array.from(element.querySelectorAll(selector), rect);
    const allDayLabel = element.querySelector(".time-all-day-label");
    const labelTextNode = Array.from(allDayLabel?.childNodes ?? [])
      .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    let labelText = null;
    if (labelTextNode) {
      const range = document.createRange();
      range.selectNodeContents(labelTextNode);
      labelText = rect(range);
    }
    const scroller = element.querySelector(".time-scroll");

    return {
      calendar: rect(element),
      headers: rects(".time-grid-header > button"),
      allDayCells: rects(".time-all-day-cell"),
      dayColumns: rects(".time-day-column"),
      zoneGutter: rect(element.querySelector(".time-zone-cell")),
      allDayGutter: allDayLabel ? rect(allDayLabel) : null,
      timeGutter: rect(element.querySelector(".time-label-column")),
      allDayLabelText: allDayLabel?.textContent?.trim() ?? "",
      allDayLabelTextRect: labelText,
      allDayLabelClientWidth: allDayLabel?.clientWidth ?? 0,
      allDayLabelScrollWidth: allDayLabel?.scrollWidth ?? 0,
      scrollbarGutter: scroller ? getComputedStyle(scroller).scrollbarGutter : "",
      reservedScrollbarWidth: scroller ? scroller.offsetWidth - scroller.clientWidth : 0,
      horizontalScrollOffset: scroller?.scrollLeft ?? 0,
      scrollClientHeight: scroller?.clientHeight ?? 0,
      scrollHeight: scroller?.scrollHeight ?? 0
    };
  });

  assert.equal(geometry.headers.length, 7, `${label} : l’en-tête doit contenir sept jours.`);
  assert.equal(geometry.allDayCells.length, 7, `${label} : la ligne Journée doit contenir sept jours.`);
  assert.equal(geometry.dayColumns.length, 7, `${label} : la grille horaire doit contenir sept jours.`);
  assert.ok(
    geometry.zoneGutter && geometry.allDayGutter && geometry.timeGutter,
    `${label} : les trois gouttières horaires doivent être rendues.`
  );
  assert.equal(
    geometry.scrollbarGutter,
    "stable",
    `${label} : le scénario doit réserver une gouttière de scrollbar déterministe.`
  );
  assert.ok(
    geometry.reservedScrollbarWidth > 0,
    `${label} : le scénario doit réellement réserver la largeur de la scrollbar.`
  );
  assert.equal(
    geometry.horizontalScrollOffset,
    0,
    `${label} : les bornes doivent être comparées sans décalage horizontal.`
  );

  assertClose(
    geometry.zoneGutter.left,
    geometry.calendar.left,
    `${label} : début de la gouttière d’en-tête`,
    CALENDAR_EDGE_TOLERANCE
  );
  assertClose(
    geometry.allDayGutter.left,
    geometry.calendar.left,
    `${label} : début de la gouttière Journée`,
    CALENDAR_EDGE_TOLERANCE
  );
  assertClose(
    geometry.timeGutter.left,
    geometry.calendar.left,
    `${label} : début de la gouttière horaire`,
    CALENDAR_EDGE_TOLERANCE
  );
  assertClose(
    geometry.zoneGutter.right,
    geometry.allDayGutter.right,
    `${label} : alignement en-tête/Journée`,
    CALENDAR_EDGE_TOLERANCE
  );
  assertClose(
    geometry.zoneGutter.right,
    geometry.timeGutter.right,
    `${label} : alignement en-tête/heures`,
    CALENDAR_EDGE_TOLERANCE
  );

  const headerBoundaries = [geometry.headers[0].left, ...geometry.headers.map((column) => column.right)];
  const allDayBoundaries = [geometry.allDayCells[0].left, ...geometry.allDayCells.map((column) => column.right)];
  const timedBoundaries = [geometry.dayColumns[0].left, ...geometry.dayColumns.map((column) => column.right)];
  for (let boundary = 0; boundary <= 7; boundary += 1) {
    assertClose(
      headerBoundaries[boundary],
      allDayBoundaries[boundary],
      `${label} : borne x ${boundary} de l’en-tête et de la ligne Journée`,
      CALENDAR_EDGE_TOLERANCE
    );
    assertClose(
      headerBoundaries[boundary],
      timedBoundaries[boundary],
      `${label} : borne x ${boundary} de l’en-tête et de la grille horaire`,
      CALENDAR_EDGE_TOLERANCE
    );
  }

  for (let index = 0; index < 7; index += 1) {
    assertClose(
      geometry.headers[index].left,
      geometry.allDayCells[index].left,
      `${label} : bord gauche en-tête/Journée du jour ${index + 1}`,
      CALENDAR_EDGE_TOLERANCE
    );
    assertClose(
      geometry.headers[index].right,
      geometry.allDayCells[index].right,
      `${label} : bord droit en-tête/Journée du jour ${index + 1}`,
      CALENDAR_EDGE_TOLERANCE
    );
    assertClose(
      geometry.headers[index].left,
      geometry.dayColumns[index].left,
      `${label} : bord gauche en-tête/grille du jour ${index + 1}`,
      CALENDAR_EDGE_TOLERANCE
    );
    assertClose(
      geometry.headers[index].right,
      geometry.dayColumns[index].right,
      `${label} : bord droit en-tête/grille du jour ${index + 1}`,
      CALENDAR_EDGE_TOLERANCE
    );
  }

  assert.equal(geometry.allDayLabelText, "Journée", `${label} : le libellé Journée doit être présent.`);
  assert.ok(geometry.allDayLabelTextRect, `${label} : le texte Journée doit être mesurable.`);
  assert.ok(
    geometry.allDayLabelTextRect.left >= geometry.allDayGutter.left - GEOMETRY_TOLERANCE &&
      geometry.allDayLabelTextRect.right <= geometry.allDayGutter.right + GEOMETRY_TOLERANCE &&
      geometry.allDayLabelTextRect.left >= geometry.calendar.left - GEOMETRY_TOLERANCE,
    `${label} : le libellé Journée ne doit être tronqué sur aucun bord.`
  );
  assert.ok(
    geometry.allDayLabelScrollWidth <= geometry.allDayLabelClientWidth + GEOMETRY_TOLERANCE,
    `${label} : le libellé Journée ne doit pas déborder horizontalement.`
  );
  assert.ok(
    geometry.scrollHeight > geometry.scrollClientHeight + GEOMETRY_TOLERANCE,
    `${label} : le contrôle doit s’exercer avec la grille horaire réellement défilable.`
  );
}
