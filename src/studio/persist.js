/**
 * Drafts, in this browser and nowhere else.
 *
 * WHY THERE IS NO SERVER HERE
 * HANDOFF.md records the decision the website was built on: the outline is
 * downloaded, not submitted, because client geometry stays off every server. The
 * studio does not get an exception for being private. Nothing about a client's
 * garden is stored on nextsteppe.garden — what is stored is a draft in the
 * browser of whoever is using the tool, so a reload, a closed lid or a lapsed
 * Access session does not cost an afternoon's tracing. The file you export is
 * still the artefact; this is only so the work survives until you export it.
 *
 * WHAT IS SAVED, AND WHAT IS NOT
 * The current frame: the view, the house, the beds with their readings, the keeps,
 * and (from the design panels) the render, planting, scope and client fields.
 *
 * NOT the undo history. Fifty frames of rings and readings is megabytes of JSON
 * written every half-second, on a store with a five-megabyte budget, and the
 * failure mode is a banner and a stutter rather than an error anyone would
 * understand. Undo lives in React state and dies with the tab, which is what
 * undo is for.
 *
 * NOT imagery. Esri tiles may not be stored, and a tile cache is what a browser
 * cache is.
 *
 * EVERY READ AND WRITE IS WRAPPED
 * localStorage throws in a private window, when site data is blocked, and when
 * the quota is gone. None of those may break a trace in progress, so a failure
 * here reports itself and the tool carries on unsaved.
 */

const PREFIX = 'nextsteppe-studio/v1';
const INDEX = `${PREFIX}/index`;
const draftKey = (slug) => `${PREFIX}/draft/${slug || '_unsaved'}`;

const store = () => {
  try {
    return window.localStorage;
  } catch {
    return null;   // private window, or site data blocked
  }
};

const read = (key) => {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;   // unparseable, or a store that throws on read
  }
};

const write = (key, value) => {
  const s = store();
  if (!s) return { ok: false, reason: 'unavailable' };
  try {
    s.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    const full = err && (err.name === 'QuotaExceededError' || err.code === 22);
    return { ok: false, reason: full ? 'full' : 'unavailable' };
  }
};

const drop = (key) => {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* nothing to do about a store that will not forget */
  }
};

/* What actually goes in. Explicit, rather than saving whatever the app happens to
   hold: state grows, and "everything except" is how a tile cache or an undo stack
   ends up on disk. */
const frameOf = (doc) => ({
  v: 1,
  savedAt: new Date().toISOString(),
  slug: doc.slug || '',
  address: doc.address || null,
  geocode: doc.geocode || null,
  view: doc.view || null,
  layer: doc.layer || null,
  site: doc.site || null,
  house: doc.house || null,
  beds: doc.beds || [],
  keeps: doc.keeps || [],
  render: doc.render || null,
  planting: doc.planting || null,
  scope: doc.scope || null,
  client: doc.client || null,
});

export function listDrafts() {
  const idx = read(INDEX);
  return Array.isArray(idx) ? idx : [];
}

function noteInIndex(slug, savedAt) {
  const rest = listDrafts().filter((d) => d.slug !== (slug || '_unsaved'));
  write(INDEX, [{ slug: slug || '_unsaved', savedAt }, ...rest].slice(0, 30));
}

export function saveDraft(doc) {
  const frame = frameOf(doc);
  const body = JSON.stringify(frame);
  const res = write(draftKey(doc.slug), frame);
  if (res.ok) noteInIndex(doc.slug, frame.savedAt);
  return { ...res, bytes: body.length, savedAt: frame.savedAt };
}

export function loadDraft(slug) {
  return read(draftKey(slug));
}

export function deleteDraft(slug) {
  drop(draftKey(slug));
  write(INDEX, listDrafts().filter((d) => d.slug !== (slug || '_unsaved')));
}

export function deleteEverything() {
  for (const d of listDrafts()) drop(draftKey(d.slug));
  drop(INDEX);
  /* Anything left under the prefix, including drafts from a schema this version
     no longer reads. */
  const s = store();
  if (!s) return;
  try {
    for (const key of Object.keys(s)) if (key.startsWith(PREFIX)) s.removeItem(key);
  } catch {
    /* already as clean as it is going to get */
  }
}

/* How much of the budget the drafts are using, for the panel to show before a
   quota error rather than after one. */
export function draftBytes() {
  const s = store();
  if (!s) return 0;
  let n = 0;
  try {
    for (const key of Object.keys(s)) {
      if (key.startsWith(PREFIX)) n += key.length + (s.getItem(key) || '').length;
    }
  } catch {
    return 0;
  }
  return n;
}

/**
 * Autosave: debounced, and silent when nothing has actually changed.
 *
 * The identical-frame check is what keeps a half-second timer off the main
 * thread's back. A pan re-renders constantly and changes nothing worth saving, so
 * without it the tool would serialise the whole document for every animation
 * frame that happened to land after the timer.
 *
 * `onTrouble` is called once per change of state, not once per attempt: a full
 * store means one banner, and then autosave stops until a delete or an export
 * makes room. Retrying every 500 ms against a store that is out of room is how a
 * tool becomes unusable at exactly the moment its work matters most.
 */
export function makeAutosave({ delay = 500, onTrouble = () => {}, onSaved = () => {} } = {}) {
  let timer = null;
  let last = '';
  let stopped = false;

  const flush = (doc) => {
    const res = saveDraft(doc);
    if (res.ok) {
      onSaved(res);
      return;
    }
    stopped = true;
    onTrouble(res.reason);
  };

  return {
    /* Call on every change. Cheap when nothing changed. */
    queue(doc) {
      if (stopped) return;
      const sig = JSON.stringify(frameOf({ ...doc, savedAt: null }));
      if (sig === last) return;
      last = sig;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush(doc);
      }, delay);
    },
    /* Write now — before an export, or on pagehide. */
    now(doc) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!stopped) flush(doc);
    },
    /* After a delete: there is room again, so start saving again. */
    resume() {
      stopped = false;
      last = '';
    },
    get stopped() {
      return stopped;
    },
  };
}
