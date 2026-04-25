/* global RULES_DATA */

(() => {
  const els = {
    progressText: document.getElementById("progressText"),
    correctText: document.getElementById("correctText"),
    wrongText: document.getElementById("wrongText"),
    accuracyText: document.getElementById("accuracyText"),
    streakText: document.getElementById("streakText"),
    avgTimeText: document.getElementById("avgTimeText"),
    ruleMeta: document.getElementById("ruleMeta"),
    question: document.getElementById("question"),
    answers: document.getElementById("answers"),
    feedback: document.getElementById("feedback"),
    feedbackBadge: document.getElementById("feedbackBadge"),
    feedbackTitle: document.getElementById("feedbackTitle"),
    feedbackBody: document.getElementById("feedbackBody"),
    nextBtn: document.getElementById("nextBtn"),
    restartBtn: document.getElementById("restartBtn"),
    restartBtn2: document.getElementById("restartBtn2"),
    reviewWrongBtn: document.getElementById("reviewWrongBtn"),
    reviewBookmarkedBtn: document.getElementById("reviewBookmarkedBtn"),
    unsureBtn: document.getElementById("unsureBtn"),
    hintBtn: document.getElementById("hintBtn"),
    bookmarkBtn: document.getElementById("bookmarkBtn"),
    card: document.getElementById("card"),
    summary: document.getElementById("summary"),
    summaryText: document.getElementById("summaryText"),
    barFill: document.getElementById("barFill"),
    hintText: document.getElementById("hintText"),
    modePenaltyBtn: document.getElementById("modePenaltyBtn"),
    modeMeaningBtn: document.getElementById("modeMeaningBtn"),
    modeCodeBtn: document.getElementById("modeCodeBtn"),
    modeYesNoBtn: document.getElementById("modeYesNoBtn"),
    modeTypeBtn: document.getElementById("modeTypeBtn"),
    answerCount: document.getElementById("answerCount"),
    keyHint: document.getElementById("keyHint"),
  };

  const rules = Array.isArray(RULES_DATA) ? RULES_DATA.slice() : [];
  if (!rules.length) {
    els.question.textContent = "Keine Regeln gefunden (rules-data.js fehlt oder leer).";
    return;
  }

  const allPenaltyOptions = unique(
    rules.map((r) => (r.penalty && r.penalty.trim() ? r.penalty.trim() : "Keine Angabe"))
  );

  const baseRules = rules
    .filter((r) => !r.deleted)
    .map((r, idx) => ({
      ...r,
      _qid: `${r.section}::${r.id}::${idx}`,
      _code: makeCode(r),
      _meaning: makeMeaning(r.text),
    }));

  const allMeaningOptions = unique(baseRules.map((r) => r._meaning));
  const allCodeOptions = unique(baseRules.map((r) => r._code));
  const meaningToRule = buildIndex(baseRules, (r) => r._meaning);
  const codeToRule = buildIndex(baseRules, (r) => r._code);
  const normalizedCodeToRule = buildIndex(baseRules, (r) => normalizeCode(r._code));
  const codeGroups = buildGroups(baseRules, (r) => codeGroup(r._code));

  let queue = [];
  let currentIndex = 0;
  let locked = false;
  let correctCount = 0;
  let wrongCount = 0;
  let wrongIds = new Set();
  let streak = 0;
  let answeredCount = 0;
  let totalTimeMs = 0;
  let questionStartMs = 0;
  let hintUsed = false;
  let activeChoiceCount = 4;
  let bookmarked = loadBookmarked();
  let yesNoState = null;
  let mode = loadMode();
  let answerCount = loadAnswerCount();

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function buildIndex(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
      const k = keyFn(item);
      if (!map.has(k)) map.set(k, item);
    }
    return map;
  }

  function buildGroups(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
      const k = keyFn(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
    return map;
  }

  function codeGroup(code) {
    const first = String(code || "").trim().split(/\s+/)[0] || "Other";
    return first;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickPenaltyChoices(correctPenalty) {
    const normalizedCorrect =
      correctPenalty && correctPenalty.trim() ? correctPenalty.trim() : "Keine Angabe";

    const pool = allPenaltyOptions.filter((p) => p !== normalizedCorrect);
    shuffleInPlace(pool);

    const base = [normalizedCorrect, pool[0], pool[1], pool[2]].filter(Boolean);
    const uniqBase = unique(base);

    if (uniqBase.length >= 4) return shuffleInPlace(uniqBase.slice(0, 4));

    const fallbackPool = shuffleInPlace(allPenaltyOptions.slice());
    while (uniqBase.length < 4 && fallbackPool.length) {
      const next = fallbackPool.pop();
      if (next && !uniqBase.includes(next)) uniqBase.push(next);
    }
    return shuffleInPlace(uniqBase);
  }

  function pickMeaningChoicesForRule(rule) {
    const correctMeaning = rule && rule._meaning ? rule._meaning : "Keine Angabe";
    const group = codeGroup(rule && rule._code ? rule._code : "");
    const groupRules = codeGroups.get(group) || [];
    const groupMeanings = groupRules.map((r) => r._meaning);
    const source = groupMeanings.length ? unique(groupMeanings) : allMeaningOptions;
    const pool = source.filter((m) => m !== correctMeaning);
    shuffleInPlace(pool);
    return fillChoices([correctMeaning], pool, source);
  }

  function pickCodeChoices(correctCode) {
    const group = codeGroup(correctCode);
    const groupCodes = (codeGroups.get(group) || []).map((r) => r._code);
    const source = groupCodes.length ? unique(groupCodes) : allCodeOptions;
    const pool = source.filter((c) => c !== correctCode);
    shuffleInPlace(pool);
    return fillChoices([correctCode], pool, source);
  }

  function pickPenaltyChoicesWithCount(correctPenalty) {
    const normalizedCorrect =
      correctPenalty && correctPenalty.trim() ? correctPenalty.trim() : "Keine Angabe";

    const pool = allPenaltyOptions.filter((p) => p !== normalizedCorrect);
    shuffleInPlace(pool);
    return fillChoices([normalizedCorrect], pool, allPenaltyOptions);
  }

  function fillChoices(seed, pool, fallbackAll) {
    const desired = Math.max(2, Math.min(4, Number(answerCount) || 4));
    const base = seed.concat(pool.slice(0, desired - 1)).filter(Boolean);
    const uniqBase = unique(base);
    if (uniqBase.length >= desired) return shuffleInPlace(uniqBase.slice(0, desired));

    const fallbackPool = shuffleInPlace(fallbackAll.slice());
    while (uniqBase.length < desired && fallbackPool.length) {
      const next = fallbackPool.pop();
      if (next && !uniqBase.includes(next)) uniqBase.push(next);
    }
    return shuffleInPlace(uniqBase);
  }

  function pickMeaningFromSameGroup(rule) {
    const group = codeGroup(rule._code);
    const groupRules = codeGroups.get(group) || [];
    if (groupRules.length <= 1) return rule._meaning;
    const pool = groupRules.map((r) => r._meaning).filter((m) => m !== rule._meaning);
    shuffleInPlace(pool);
    return pool[0] || rule._meaning;
  }

  function buildYesNoState(rule) {
    const isTrue = Math.random() < 0.5;
    const shownMeaning = isTrue ? rule._meaning : pickMeaningFromSameGroup(rule);
    const statement = `${rule._code} bedeutet: „${shownMeaning}“`;
    return { isTrue, shownMeaning, statement };
  }

  function setStats() {
    els.progressText.textContent = `${Math.min(currentIndex + 1, queue.length)}/${queue.length}`;
    els.correctText.textContent = String(correctCount);
    els.wrongText.textContent = String(wrongCount);
    const answered = correctCount + wrongCount;
    const acc = answered ? Math.round((correctCount / answered) * 100) : 0;
    if (els.accuracyText) els.accuracyText.textContent = `${acc}%`;
    if (els.streakText) els.streakText.textContent = String(streak);
    if (els.avgTimeText) {
      els.avgTimeText.textContent = answeredCount ? formatMs(totalTimeMs / answeredCount) : "—";
    }
    const pct = queue.length ? Math.round((currentIndex / queue.length) * 100) : 0;
    els.barFill.style.width = `${pct}%`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function recordTime() {
    const end = performance.now();
    const elapsed = Math.max(0, end - (questionStartMs || end));
    totalTimeMs += elapsed;
    answeredCount += 1;
  }

  function formatMs(ms) {
    const s = Math.max(0, ms) / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function penaltyKind(p) {
    const s = String(p || "").toLowerCase();
    if (s.includes("permanenter bann") || s.includes("permanent")) return "Permanenter Bann";
    if (s.includes("bann") || s.includes("ban")) return "Bann";
    if (s.includes("jail")) return "Jail";
    if (s.includes("mute")) return "Mute";
    if (s.includes("warn")) return "Warn";
    if (s.includes("stimmen")) return "Stimmenabzug";
    if (s.includes("status")) return "Status";
    return "Sonstiges";
  }

  function buildWhyPenalty({ chosenPenalty, correctPenalty }) {
    if (!chosenPenalty || chosenPenalty === "Unsicher") return "";
    if (chosenPenalty === correctPenalty) return "";
    const a = penaltyKind(chosenPenalty);
    const b = penaltyKind(correctPenalty);
    if (a !== b) {
      return `${escapeHtml(chosenPenalty)} ist vom Typ <b>${escapeHtml(a)}</b>, diese Regel ist aber <b>${escapeHtml(
        b
      )}</b>.`;
    }
    return `Diese Regel hat genau die Sanktion <b>${escapeHtml(correctPenalty)}</b>.`;
  }

  function buildWhyCode({ chosenCode, correctCode }) {
    if (!chosenCode || chosenCode === "Unsicher") return "";
    if (chosenCode === correctCode) return "";
    const chosenRule = codeToRule.get(chosenCode);
    if (!chosenRule) return "";
    return `Du hast <b>${escapeHtml(chosenCode)}</b> gewählt – das ist eigentlich: “${escapeHtml(
      chosenRule._meaning
    )}”.`;
  }

  function buildWhyMeaning({ chosenMeaning, correctMeaning }) {
    if (!chosenMeaning || chosenMeaning === "Unsicher") return "";
    if (chosenMeaning === correctMeaning) return "";
    const chosenRule = meaningToRule.get(chosenMeaning);
    if (!chosenRule) return "";
    return `Deine Auswahl gehört zu <b>${escapeHtml(chosenRule._code)}</b> (nicht zu dieser Regel).`;
  }

  function buildExplanationBlock(rule) {
    const parts = [];
    const explanation = rule.explanation && String(rule.explanation).trim();
    const exampleGood = rule.exampleGood && String(rule.exampleGood).trim();
    const exampleBad = rule.exampleBad && String(rule.exampleBad).trim();

    if (!explanation && !exampleGood && !exampleBad) return "";

    if (explanation) {
      parts.push(
        `<div style="margin-top:10px"><span class="muted">Erklärung:</span><div style="margin-top:6px">${escapeHtml(
          explanation
        )}</div></div>`
      );
    }
    if (exampleGood) {
      parts.push(
        `<div style="margin-top:10px"><span class="muted">Beispiel (richtig):</span><div style="margin-top:6px">${escapeHtml(
          exampleGood
        )}</div></div>`
      );
    }
    if (exampleBad) {
      parts.push(
        `<div style="margin-top:10px"><span class="muted">Beispiel (falsch):</span><div style="margin-top:6px">${escapeHtml(
          exampleBad
        )}</div></div>`
      );
    }
    return `<details style="margin-top:12px"><summary style="cursor:pointer;color:rgba(255,255,255,0.78);font-weight:800">Erklärung & Beispiele</summary>${parts.join(
      ""
    )}</details>`;
  }

  function showFeedback({ ok, rule, chosenPenalty, correctPenalty }) {
    els.feedback.hidden = false;
    els.feedbackBadge.classList.toggle("good", ok);
    els.feedbackBadge.classList.toggle("bad", !ok);
    els.feedbackBadge.textContent = ok ? "RICHTIG" : "FALSCH";
    els.feedbackTitle.textContent = ok
      ? "Passt."
      : `Deine Antwort: “${chosenPenalty}” — korrekt ist: “${correctPenalty}”`;

    const lines = [];
    lines.push(`<div><span class="muted">Regeltext:</span> ${escapeHtml(rule.text)}</div>`);
    lines.push(
      `<div style="margin-top:6px"><span class="muted">Sanktion:</span> ${escapeHtml(
        correctPenalty
      )}</div>`
    );
    const why = buildWhyPenalty({ chosenPenalty, correctPenalty });
    if (why) {
      lines.push(
        `<div style="margin-top:10px"><span class="muted">Warum falsch?</span><div style="margin-top:6px">${why}</div></div>`
      );
    }
    if (rule.note) {
      lines.push(
        `<div style="margin-top:6px"><span class="muted">Hinweis:</span> ${escapeHtml(
          rule.note
        )}</div>`
      );
    }
    const exp = buildExplanationBlock(rule);
    if (exp) lines.push(exp);
    els.feedbackBody.innerHTML = lines.join("");
  }

  function showFeedbackMeaning({ ok, rule, chosenMeaning, correctMeaning }) {
    els.feedback.hidden = false;
    els.feedbackBadge.classList.toggle("good", ok);
    els.feedbackBadge.classList.toggle("bad", !ok);
    els.feedbackBadge.textContent = ok ? "RICHTIG" : "FALSCH";
    els.feedbackTitle.textContent = ok
      ? "Passt."
      : `Deine Antwort: “${chosenMeaning}” — korrekt ist: “${correctMeaning}”`;

    const lines = [];
    lines.push(`<div><span class="muted">Regel:</span> ${escapeHtml(rule._code)}</div>`);
    lines.push(`<div style="margin-top:6px"><span class="muted">Text:</span> ${escapeHtml(rule.text)}</div>`);
    if (rule.penalty) {
      const pen = rule.penalty && rule.penalty.trim() ? rule.penalty.trim() : "Keine Angabe";
      lines.push(
        `<div style="margin-top:6px"><span class="muted">Sanktion:</span> ${escapeHtml(pen)}</div>`
      );
    }
    const why = buildWhyMeaning({ chosenMeaning, correctMeaning });
    if (why) {
      lines.push(
        `<div style="margin-top:10px"><span class="muted">Warum falsch?</span><div style="margin-top:6px">${why}</div></div>`
      );
    }
    const exp = buildExplanationBlock(rule);
    if (exp) lines.push(exp);
    els.feedbackBody.innerHTML = lines.join("");
  }

  function showFeedbackCode({ ok, rule, chosenCode, correctCode }) {
    els.feedback.hidden = false;
    els.feedbackBadge.classList.toggle("good", ok);
    els.feedbackBadge.classList.toggle("bad", !ok);
    els.feedbackBadge.textContent = ok ? "RICHTIG" : "FALSCH";
    els.feedbackTitle.textContent = ok
      ? "Passt."
      : `Deine Antwort: “${chosenCode}” — korrekt ist: “${correctCode}”`;

    const pen = rule.penalty && rule.penalty.trim() ? rule.penalty.trim() : "Keine Angabe";
    const lines = [];
    lines.push(`<div><span class="muted">Regel:</span> ${escapeHtml(correctCode)}</div>`);
    lines.push(`<div style="margin-top:6px"><span class="muted">Text:</span> ${escapeHtml(rule.text)}</div>`);
    lines.push(`<div style="margin-top:6px"><span class="muted">Sanktion:</span> ${escapeHtml(pen)}</div>`);
    const why = buildWhyCode({ chosenCode, correctCode });
    if (why) {
      lines.push(
        `<div style="margin-top:10px"><span class="muted">Warum falsch?</span><div style="margin-top:6px">${why}</div></div>`
      );
    }
    const exp = buildExplanationBlock(rule);
    if (exp) lines.push(exp);
    els.feedbackBody.innerHTML = lines.join("");
  }

  function showFeedbackYesNo({ ok, rule, chosen, isTrue, statement }) {
    els.feedback.hidden = false;
    els.feedbackBadge.classList.toggle("good", ok);
    els.feedbackBadge.classList.toggle("bad", !ok);
    els.feedbackBadge.textContent = ok ? "RICHTIG" : "FALSCH";

    const correctAnswer = isTrue ? "Ja" : "Nein";
    els.feedbackTitle.textContent = ok
      ? "Passt."
      : `Deine Antwort: „${chosen}“ — korrekt ist: „${correctAnswer}“`;

    const lines = [];
    lines.push(`<div><span class="muted">Aussage:</span> ${escapeHtml(statement)}</div>`);
    lines.push(
      `<div style="margin-top:6px"><span class="muted">Korrekt:</span> <b>${escapeHtml(
        correctAnswer
      )}</b></div>`
    );
    lines.push(
      `<div style="margin-top:10px"><span class="muted">Richtig wäre:</span> ${escapeHtml(
        rule._code
      )} → “${escapeHtml(rule._meaning)}”</div>`
    );

    if (!isTrue) {
      const other = meaningToRule.get(yesNoState?.shownMeaning || "");
      if (other && other._code !== rule._code) {
        lines.push(
          `<div style="margin-top:6px"><span class="muted">Hinweis:</span> Die Aussage passt eigentlich zu <b>${escapeHtml(
            other._code
          )}</b>.</div>`
        );
      }
    }

    const exp = buildExplanationBlock(rule);
    if (exp) lines.push(exp);
    els.feedbackBody.innerHTML = lines.join("");
  }

  function showFeedbackType({ ok, rule, entered }) {
    els.feedback.hidden = false;
    els.feedbackBadge.classList.toggle("good", ok);
    els.feedbackBadge.classList.toggle("bad", !ok);
    els.feedbackBadge.textContent = ok ? "RICHTIG" : "FALSCH";

    const clean = String(entered || "").trim();
    els.feedbackTitle.textContent = ok
      ? "Passt."
      : `Deine Eingabe: „${clean || "—"}“ — korrekt ist: „${rule._code}“`;

    const pen = rule.penalty && rule.penalty.trim() ? rule.penalty.trim() : "Keine Angabe";
    const lines = [];
    lines.push(`<div><span class="muted">Regeltext:</span> ${escapeHtml(rule.text)}</div>`);
    lines.push(
      `<div style="margin-top:6px"><span class="muted">Korrekt:</span> <b>${escapeHtml(
        rule._code
      )}</b></div>`
    );
    if (clean) {
      lines.push(
        `<div style="margin-top:6px"><span class="muted">Eingegeben:</span> ${escapeHtml(
          clean
        )}</div>`
      );
    }
    lines.push(`<div style="margin-top:6px"><span class="muted">Sanktion:</span> ${escapeHtml(pen)}</div>`);

    if (!ok && clean) {
      const other = normalizedCodeToRule.get(normalizeCode(clean));
      if (other && other._code !== rule._code) {
        lines.push(
          `<div style="margin-top:10px"><span class="muted">Warum falsch?</span><div style="margin-top:6px">Deine Eingabe passt eigentlich zu <b>${escapeHtml(
            other._code
          )}</b>: “${escapeHtml(other._meaning)}”.</div></div>`
        );
      }
    }

    const exp = buildExplanationBlock(rule);
    if (exp) lines.push(exp);
    els.feedbackBody.innerHTML = lines.join("");
  }

  function renderQuestion() {
    locked = false;
    hintUsed = false;
    yesNoState = null;
    els.nextBtn.disabled = true;
    els.feedback.hidden = true;
    els.feedbackBody.textContent = "";
    if (els.unsureBtn) els.unsureBtn.disabled = false;
    if (els.hintBtn) els.hintBtn.disabled = true;

    const rule = queue[currentIndex];
    if (!rule) return;

    const correctPenalty =
      rule.penalty && rule.penalty.trim() ? rule.penalty.trim() : "Keine Angabe";

    if (mode === "code" || mode === "type") els.ruleMeta.textContent = `${rule.section}`;
    else if (mode === "meaning" || mode === "yesno") els.ruleMeta.textContent = `${rule.section} · ${rule._code}`;
    else els.ruleMeta.textContent = `${rule.section} · ${rule.id}`;
    updateBookmarkUI(rule);

    const choices =
      mode === "meaning"
        ? pickMeaningChoicesForRule(rule)
        : mode === "code"
          ? pickCodeChoices(rule._code)
          : mode === "type"
            ? []
          : mode === "yesno"
            ? ["Ja", "Nein"]
            : pickPenaltyChoicesWithCount(correctPenalty);
    els.answers.innerHTML = "";

    if (mode === "meaning") {
      els.question.textContent = `Was ist ${rule._code}?`;
      els.hintText.textContent = "Frage: Welche Beschreibung passt zu dieser Regelnummer?";
    } else if (mode === "type") {
      els.question.textContent = rule.text;
      els.hintText.textContent = "Frage: Schreib die passende Regelnummer (z.B. Allg. 6.2).";
    } else if (mode === "yesno") {
      yesNoState = buildYesNoState(rule);
      els.question.textContent = yesNoState.statement;
      els.hintText.textContent = "Frage: Stimmt diese Aussage? (Ja/Nein)";
    } else if (mode === "code") {
      els.question.textContent = rule.text;
      els.hintText.textContent = "Frage: Welche Regelnummer ist das?";
    } else {
      els.question.textContent = rule.text;
      els.hintText.textContent = "Frage: Welche Sanktion/Strafe ist für diese Regel angegeben?";
    }

    questionStartMs = performance.now();

    if (mode === "type") {
      const wrap = document.createElement("div");
      wrap.className = "typeWrap";

      const input = document.createElement("input");
      input.className = "typeInput";
      input.type = "text";
      input.inputMode = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = "z.B. Allg. 6.2";
      input.setAttribute("aria-label", "Regelnummer eingeben");

      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "btn";
      submit.textContent = "Prüfen";
      submit.addEventListener("click", () => onTypeSubmit(input.value, rule));

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit.click();
        }
      });

      wrap.appendChild(input);
      wrap.appendChild(submit);
      els.answers.appendChild(wrap);

      activeChoiceCount = 0;
      updateKeyHint();
      if (els.hintBtn) els.hintBtn.disabled = true;
      setStats();
      setTimeout(() => input.focus(), 0);
      return;
    }

    choices.forEach((value, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ans";
      if (mode === "meaning") btn.dataset.meaning = value;
      else if (mode === "code") btn.dataset.code = value;
      else if (mode === "yesno") btn.dataset.yesno = value;
      else btn.dataset.penalty = value;
      btn.dataset.index = String(idx);
      btn.innerHTML = `<span class="num">${idx + 1}</span>${escapeHtml(value)}`;
      btn.addEventListener("click", () => onChoose(btn, rule, correctPenalty));
      els.answers.appendChild(btn);
    });

    activeChoiceCount = choices.length;
    updateKeyHint();
    if (els.hintBtn) els.hintBtn.disabled = activeChoiceCount <= 2;

    setStats();
  }

  function onTypeSubmit(value, rule) {
    if (locked) return;
    locked = true;
    if (els.unsureBtn) els.unsureBtn.disabled = true;
    if (els.hintBtn) els.hintBtn.disabled = true;

    recordTime();

    const entered = String(value || "");
    const ok = normalizeCode(entered) === normalizeCode(rule._code);

    if (ok) correctCount += 1;
    else {
      wrongCount += 1;
      wrongIds.add(rule._qid);
    }
    streak = ok ? streak + 1 : 0;

    showFeedbackType({ ok, rule, entered });
    els.nextBtn.disabled = false;
    setStats();
  }

  function markButtonsAfterChoice(chosenBtn, correctPenalty) {
    const buttons = Array.from(els.answers.querySelectorAll(".ans"));
    for (const b of buttons) b.disabled = true;

    for (const b of buttons) {
      const isCorrect = (() => {
        if (mode === "meaning") return b.dataset.meaning === queue[currentIndex]._meaning;
        if (mode === "yesno") return (b.dataset.yesno === "Ja") === Boolean(yesNoState && yesNoState.isTrue);
        if (mode === "code") return b.dataset.code === queue[currentIndex]._code;
        return b.dataset.penalty === correctPenalty;
      })();
      const isChosen = chosenBtn ? b === chosenBtn : false;

      if (isCorrect) b.classList.add("correct");
      if (isChosen && !isCorrect) b.classList.add("wrong");
      if (!isChosen && !isCorrect) b.classList.add("dim");
    }
  }

  function onChoose(btn, rule, correctPenalty) {
    if (locked) return;
    locked = true;
    if (els.unsureBtn) els.unsureBtn.disabled = true;
    if (els.hintBtn) els.hintBtn.disabled = true;

    const chosenMeaning = btn.dataset.meaning;
    const chosenPenalty = btn.dataset.penalty;
    const chosenCode = btn.dataset.code;
    const chosenYesNo = btn.dataset.yesno;
    const ok =
      mode === "meaning"
        ? chosenMeaning === rule._meaning
        : mode === "yesno"
          ? (chosenYesNo === "Ja") === Boolean(yesNoState && yesNoState.isTrue)
        : mode === "code"
          ? chosenCode === rule._code
          : chosenPenalty === correctPenalty;

    recordTime();
    if (ok) correctCount += 1;
    else {
      wrongCount += 1;
      wrongIds.add(rule._qid);
    }
    streak = ok ? streak + 1 : 0;

    markButtonsAfterChoice(btn, correctPenalty);
    if (mode === "meaning") {
      showFeedbackMeaning({
        ok,
        rule,
        chosenMeaning,
        correctMeaning: rule._meaning,
      });
    } else if (mode === "yesno") {
      showFeedbackYesNo({
        ok,
        rule,
        chosen: chosenYesNo,
        isTrue: Boolean(yesNoState && yesNoState.isTrue),
        statement: yesNoState ? yesNoState.statement : "",
      });
    } else if (mode === "code") {
      showFeedbackCode({
        ok,
        rule,
        chosenCode,
        correctCode: rule._code,
      });
    } else {
      showFeedback({ ok, rule, chosenPenalty, correctPenalty });
    }
    els.nextBtn.disabled = false;
    setStats();
  }

  function onUnsure() {
    if (locked) return;
    locked = true;
    if (els.unsureBtn) els.unsureBtn.disabled = true;
    if (els.hintBtn) els.hintBtn.disabled = true;

    const rule = queue[currentIndex];
    if (!rule) return;

    recordTime();
    wrongCount += 1;
    wrongIds.add(rule._qid);
    streak = 0;

    const correctPenalty =
      rule.penalty && rule.penalty.trim() ? rule.penalty.trim() : "Keine Angabe";

    markButtonsAfterChoice(null, correctPenalty);

    if (mode === "meaning") {
      showFeedbackMeaning({
        ok: false,
        rule,
        chosenMeaning: "Unsicher",
        correctMeaning: rule._meaning,
      });
    } else if (mode === "type") {
      showFeedbackType({
        ok: false,
        rule,
        entered: "Unsicher",
      });
    } else if (mode === "yesno") {
      if (!yesNoState) yesNoState = buildYesNoState(rule);
      showFeedbackYesNo({
        ok: false,
        rule,
        chosen: "Unsicher",
        isTrue: Boolean(yesNoState && yesNoState.isTrue),
        statement: yesNoState ? yesNoState.statement : "",
      });
    } else if (mode === "code") {
      showFeedbackCode({
        ok: false,
        rule,
        chosenCode: "Unsicher",
        correctCode: rule._code,
      });
    } else {
      showFeedback({
        ok: false,
        rule,
        chosenPenalty: "Unsicher",
        correctPenalty,
      });
    }

    els.nextBtn.disabled = false;
    setStats();
  }

  function next() {
    if (currentIndex >= queue.length - 1) {
      showSummary();
      return;
    }
    currentIndex += 1;
    renderQuestion();
  }

  function showSummary() {
    els.card.hidden = true;
    els.summary.hidden = false;
    els.barFill.style.width = "100%";
    els.progressText.textContent = `${queue.length}/${queue.length}`;

    const total = queue.length;
    const pct = total ? Math.round((correctCount / total) * 100) : 0;
    els.summaryText.textContent = `Score: ${correctCount}/${total} richtig (${pct}%). Fehler: ${wrongCount}.`;
    els.reviewWrongBtn.disabled = wrongIds.size === 0;
    if (els.reviewBookmarkedBtn) els.reviewBookmarkedBtn.disabled = bookmarked.size === 0;
  }

  function start({ onlyWrong = false, onlyBookmarked = false } = {}) {
    els.summary.hidden = true;
    els.card.hidden = false;

    correctCount = 0;
    wrongCount = 0;
    currentIndex = 0;
    locked = false;
    streak = 0;
    answeredCount = 0;
    totalTimeMs = 0;
    els.barFill.style.width = "0%";

    let selected = baseRules.slice();
    if (onlyBookmarked) selected = selected.filter((r) => bookmarked.has(bookmarkKey(r)));
    if (onlyWrong) selected = selected.filter((r) => wrongIds.has(r._qid));
    queue = shuffleInPlace(selected.slice());

    renderQuestion();
  }

  function setMode(nextMode) {
    mode = nextMode;
    saveMode(mode);

    const codeActive = mode === "code";
    const yesNoActive = mode === "yesno";
    const typeActive = mode === "type";
    const meaningActive = mode === "meaning";
    const penaltyActive = mode === "penalty";

    els.modeCodeBtn.classList.toggle("active", codeActive);
    if (els.modeYesNoBtn) els.modeYesNoBtn.classList.toggle("active", yesNoActive);
    if (els.modeTypeBtn) els.modeTypeBtn.classList.toggle("active", typeActive);
    els.modeMeaningBtn.classList.toggle("active", meaningActive);
    els.modePenaltyBtn.classList.toggle("active", penaltyActive);

    els.modeCodeBtn.setAttribute("aria-pressed", codeActive ? "true" : "false");
    if (els.modeYesNoBtn) els.modeYesNoBtn.setAttribute("aria-pressed", yesNoActive ? "true" : "false");
    if (els.modeTypeBtn) els.modeTypeBtn.setAttribute("aria-pressed", typeActive ? "true" : "false");
    els.modeMeaningBtn.setAttribute("aria-pressed", meaningActive ? "true" : "false");
    els.modePenaltyBtn.setAttribute("aria-pressed", penaltyActive ? "true" : "false");

    wrongIds = new Set();
    start();
  }

  function loadMode() {
    try {
      const v = localStorage.getItem("de3_rules_trainer_mode");
      if (v === "meaning") return "meaning";
      if (v === "yesno") return "yesno";
      if (v === "type") return "type";
      if (v === "penalty") return "penalty";
      return "code";
    } catch {
      return "code";
    }
  }

  function saveMode(v) {
    try {
      localStorage.setItem("de3_rules_trainer_mode", v);
    } catch {
      // ignore
    }
  }

  function loadAnswerCount() {
    try {
      const v = Number(localStorage.getItem("de3_rules_trainer_answer_count"));
      if (v === 2 || v === 3 || v === 4) return v;
      return 4;
    } catch {
      return 4;
    }
  }

  function saveAnswerCount(v) {
    try {
      localStorage.setItem("de3_rules_trainer_answer_count", String(v));
    } catch {
      // ignore
    }
  }

  function updateKeyHint() {
    const n = Math.max(1, Math.min(4, Number(activeChoiceCount) || 1));
    if (mode === "yesno") {
      els.keyHint.textContent = "Tipp: 1 = Ja • 2 = Nein • U = Unsicher • B = Merken";
      return;
    }
    if (mode === "type") {
      els.keyHint.textContent = "Tipp: Regelnummer eintippen und Enter drücken • U = Unsicher • B = Merken";
      return;
    }
    els.keyHint.textContent = `Tipp: Zahlen (1–${n}) wählen • U = Unsicher • H = Hinweis • B = Merken`;
  }

  function normalizeCode(s) {
    const raw = String(s || "").trim();
    if (!raw) return "";

    return raw
      .toLowerCase()
      .replace(/\s+/g, "")
      .replaceAll("„", "")
      .replaceAll("“", "")
      .replaceAll("”", "")
      .replaceAll('"', "")
      .replaceAll("'", "")
      .replaceAll(":", "")
      .replaceAll(";", "")
      .replaceAll(",", "")
      .replaceAll("·", "")
      .replaceAll("allgemein", "allg")
      .replaceAll("allg.", "allg")
      .replaceAll("allg", "allg")
      .replaceAll("rp.", "rp")
      .replaceAll("rp", "rp")
      .replaceAll("leader.", "leader")
      .replaceAll("leader", "leader")
      .replaceAll("event.", "event")
      .replaceAll("event", "event")
      .replaceAll("ghetto.", "ghetto")
      .replaceAll("ghetto", "ghetto")
      .replaceAll("turf.", "turf")
      .replaceAll("turf", "turf")
      .replaceAll("greenzone.", "greenzone")
      .replaceAll("greenzone", "greenzone")
      .replaceAll("wahl.", "wahl")
      .replaceAll("wahl", "wahl");
  }

  function bookmarkKey(rule) {
    return `${rule.section}::${rule.id}`;
  }

  function loadBookmarked() {
    try {
      const raw = localStorage.getItem("de3_rules_trainer_bookmarked");
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.map((x) => String(x)));
    } catch {
      return new Set();
    }
  }

  function saveBookmarked() {
    try {
      localStorage.setItem(
        "de3_rules_trainer_bookmarked",
        JSON.stringify(Array.from(bookmarked))
      );
    } catch {
      // ignore
    }
  }

  function updateBookmarkUI(rule) {
    if (!els.bookmarkBtn || !rule) return;
    const key = bookmarkKey(rule);
    const on = bookmarked.has(key);
    els.bookmarkBtn.textContent = on ? "Gemerkt ★" : "Merken";
  }

  function toggleBookmark() {
    const rule = queue[currentIndex];
    if (!rule) return;
    const key = bookmarkKey(rule);
    if (bookmarked.has(key)) bookmarked.delete(key);
    else bookmarked.add(key);
    saveBookmarked();
    updateBookmarkUI(rule);
    if (els.reviewBookmarkedBtn) els.reviewBookmarkedBtn.disabled = bookmarked.size === 0;
  }

  function useHint5050() {
    if (locked || hintUsed) return;
    const rule = queue[currentIndex];
    if (!rule) return;

    const correctPenalty =
      rule.penalty && rule.penalty.trim() ? rule.penalty.trim() : "Keine Angabe";

    const buttons = Array.from(els.answers.querySelectorAll(".ans")).filter((b) => !b.disabled);
    if (buttons.length <= 2) return;

    const isCorrect = (b) => {
      if (mode === "meaning") return b.dataset.meaning === rule._meaning;
      if (mode === "code") return b.dataset.code === rule._code;
      return b.dataset.penalty === correctPenalty;
    };

    const correctBtn = buttons.find(isCorrect);
    const wrongBtns = buttons.filter((b) => !isCorrect(b));
    if (!correctBtn || wrongBtns.length < 2) return;

    shuffleInPlace(wrongBtns);
    const keepWrong = wrongBtns[0];
    const toDisable = wrongBtns.slice(1);
    for (const b of toDisable) {
      b.disabled = true;
      b.classList.add("dim");
    }
    keepWrong.classList.remove("dim");
    correctBtn.classList.remove("dim");

    hintUsed = true;
    if (els.hintBtn) els.hintBtn.disabled = true;
  }

  function makeCode(rule) {
    const s = String(rule.section || "");
    if (s.startsWith("Allgemein") || s === "Spielregeln") return `Allg. ${rule.id}`;
    if (s === "RP Begriffe") return `RP ${rule.id}`;
    if (s.startsWith("Leader")) return `Leader ${rule.id}`;
    if (s.startsWith("Event")) return `Event ${rule.id}`;
    if (s.startsWith("Ghetto")) return `Ghetto ${rule.id}`;
    if (s.startsWith("Turf")) return `Turf ${rule.id}`;
    if (s.startsWith("Greenzone")) return `Greenzone ${rule.id}`;
    if (s.startsWith("Wahl")) return `Wahl ${rule.id}`;
    return `${rule.id}`;
  }

  function makeMeaning(text) {
    let t = String(text || "").trim();
    if (!t) return "Keine Angabe";
    t = t.replace(/\s*\|.*$/g, "").trim();
    t = t.replace(/^(Es ist verboten,?\s*)/i, "");
    t = t.replace(/^(Es ist nicht gestattet,?\s*)/i, "");
    t = t.replace(/^(Es ist untersagt,?\s*)/i, "");
    t = t.replace(/^(Das\s+)/i, ""); // "Das Töten..." → "Töten..."
    t = t.replace(/\s+/g, " ").trim();
    if (t.length > 92) t = `${t.slice(0, 92).trimEnd()}…`;
    return t;
  }

  els.nextBtn.addEventListener("click", next);
  els.restartBtn.addEventListener("click", () => {
    wrongIds = new Set();
    start();
  });
  els.restartBtn2.addEventListener("click", () => {
    wrongIds = new Set();
    start();
  });
  els.reviewWrongBtn.addEventListener("click", () => start({ onlyWrong: true }));
  if (els.reviewBookmarkedBtn) {
    els.reviewBookmarkedBtn.addEventListener("click", () => start({ onlyBookmarked: true }));
  }

  els.modeMeaningBtn.addEventListener("click", () => setMode("meaning"));
  els.modeCodeBtn.addEventListener("click", () => setMode("code"));
  if (els.modeYesNoBtn) els.modeYesNoBtn.addEventListener("click", () => setMode("yesno"));
  if (els.modeTypeBtn) els.modeTypeBtn.addEventListener("click", () => setMode("type"));
  els.modePenaltyBtn.addEventListener("click", () => setMode("penalty"));
  if (els.unsureBtn) els.unsureBtn.addEventListener("click", onUnsure);
  if (els.hintBtn) els.hintBtn.addEventListener("click", useHint5050);
  if (els.bookmarkBtn) els.bookmarkBtn.addEventListener("click", toggleBookmark);

  if (els.answerCount) {
    els.answerCount.value = String(answerCount);
    els.answerCount.addEventListener("change", () => {
      const v = Number(els.answerCount.value);
      if (v !== 2 && v !== 3 && v !== 4) return;
      answerCount = v;
      saveAnswerCount(answerCount);
      updateKeyHint();
      renderQuestion();
    });
  }

  window.addEventListener("keydown", (e) => {
    const target = e.target;
    const tag = target && target.tagName ? String(target.tagName).toUpperCase() : "";
    const isTyping =
      tag === "INPUT" || tag === "TEXTAREA" || Boolean(target && target.isContentEditable);
    if (isTyping) {
      if (e.key === "Enter" && !els.nextBtn.disabled && els.summary.hidden) {
        e.preventDefault();
        els.nextBtn.click();
      }
      return;
    }
    if (e.key === "Enter" && !els.nextBtn.disabled && els.summary.hidden) {
      els.nextBtn.click();
      return;
    }
    if ((e.key === "u" || e.key === "U") && els.unsureBtn && !els.unsureBtn.disabled) {
      els.unsureBtn.click();
      return;
    }
    if ((e.key === "h" || e.key === "H") && els.hintBtn && !els.hintBtn.disabled) {
      els.hintBtn.click();
      return;
    }
    if (e.key === "b" || e.key === "B") {
      toggleBookmark();
      return;
    }
    const num = Number(e.key);
    if (!Number.isFinite(num) || num < 1 || num > activeChoiceCount) return;
    const btn = els.answers.querySelector(`.ans[data-index="${num - 1}"]`);
    if (btn && !btn.disabled) btn.click();
  });

  updateKeyHint();
  setMode(mode);
})();
