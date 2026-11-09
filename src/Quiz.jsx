import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase.js";
import { Sheet, inputCls, goldBtn, lineBtn, labelCls } from "./ui.jsx";
import { callTool, postNotice } from "./toolApi.js";

// How many questions have their answers shown to everyone
export function revealedCount(quiz) {
  const n = quiz.questions.length;
  if (quiz.status === "done") return n;
  return quiz.status === "reveal" ? quiz.index + 1 : quiz.index;
}

// Points for every player, best first
export function scoreboard(questions, answerDocs, revealed) {
  return answerDocs
    .map(d => {
      let points = 0;
      for (let i = 0; i < revealed; i++) {
        if (d.answers && Number(d.answers[i]) === questions[i].answer) points++;
      }
      return { uid: d.uid, name: d.name || "Someone", points, answered: Object.keys(d.answers || {}).length };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

const LETTERS = ["A", "B", "C", "D"];

export default function Quiz({ room, onClose }) {
  const { code, name, user, isStaff } = room;
  const [quiz, setQuiz] = useState(undefined); // undefined = loading, null = none
  const [answers, setAnswers] = useState([]);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [lang, setLang] = useState("English");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const quizRef = () => doc(db, "chats", code, "quiz", "current");

  useEffect(() => onSnapshot(quizRef(), s => setQuiz(s.exists() ? s.data() : null), () => setQuiz(null)), [code]);

  useEffect(() => {
    if (!quiz || !quiz.quizId) {
      setAnswers([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "chats", code, "quizAnswers"), where("quizId", "==", quiz.quizId)),
      s => setAnswers(s.docs.map(d => d.data())),
      () => {}
    );
  }, [code, quiz && quiz.quizId]);

  async function start() {
    if (!topic.trim()) return setError("Type a topic first.");
    setBusy(true);
    setError("");
    try {
      const data = await callTool({ tool: "quiz", topic: topic.trim(), count, language: lang });
      await setDoc(quizRef(), {
        quizId: String(Date.now()),
        topic: data.topic || topic.trim(),
        questions: data.questions,
        index: 0,
        status: "open",
        startedBy: name,
        createdAt: serverTimestamp(),
      });
      await postNotice(code, user.uid, name, `${name} started a quiz: ${data.topic || topic.trim()} (${data.questions.length} questions). Open the menu and tap Quiz night to play.`).catch(() => {});
    } catch (e) {
      setError(e.message || "Couldn't start the quiz.");
    }
    setBusy(false);
  }

  async function answer(choice) {
    try {
      await setDoc(
        doc(db, "chats", code, "quizAnswers", quiz.quizId + "_" + user.uid),
        { uid: user.uid, quizId: quiz.quizId, name, answers: { [quiz.index]: choice } },
        { merge: true }
      );
    } catch {
      setError("Couldn't save your answer. Try again.");
    }
  }

  async function reveal() {
    await updateDoc(quizRef(), { status: "reveal" }).catch(() => setError("Couldn't update the quiz."));
  }
  async function next() {
    await updateDoc(quizRef(), { index: quiz.index + 1, status: "open" }).catch(() => setError("Couldn't update the quiz."));
  }
  async function finish() {
    try {
      await updateDoc(quizRef(), { status: "done" });
      const board = scoreboard(quiz.questions, answers, quiz.questions.length).slice(0, 3);
      if (board.length) {
        const text = board.map((b, i) => `${["🥇", "🥈", "🥉"][i]} ${b.name} ${b.points}/${quiz.questions.length}`).join("  ");
        await postNotice(code, user.uid, name, `Quiz finished: ${quiz.topic}. ${text}`).catch(() => {});
      }
    } catch {
      setError("Couldn't finish the quiz.");
    }
  }

  const form = (
    <div className="space-y-3">
      <p className="text-[13px] text-[#D8D2C4]">Sibiya AI writes the questions, everyone answers on their phone, and the scores update live.</p>
      <div>
        <div className={labelCls}>Topic</div>
        <input className={inputCls + " mt-1"} value={topic} maxLength={80} placeholder="e.g. Zulu culture, Grade 12 maths, 90s music" onChange={e => setTopic(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={labelCls}>Questions</div>
          <select className={inputCls + " mt-1"} value={count} onChange={e => setCount(Number(e.target.value))}>
            {[5, 8, 10].map(n => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <div className={labelCls}>Language</div>
          <select className={inputCls + " mt-1"} value={lang} onChange={e => setLang(e.target.value)}>
            <option>English</option>
            <option>isiZulu</option>
            <option>English and isiZulu mix</option>
          </select>
        </div>
      </div>
      {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
      <button className={goldBtn} onClick={start} disabled={busy}>
        {busy ? "Writing the questions..." : "Start the quiz"}
      </button>
    </div>
  );

  let body;
  if (quiz === undefined) body = <div className="text-[13px] text-[#B5A284]">Loading...</div>;
  else if (quiz === null) body = isStaff ? form : <p className="text-[14px] text-[#D8D2C4]">No quiz right now. The host or a co-host can start one.</p>;
  else {
    const n = quiz.questions.length;
    const q = quiz.questions[Math.min(quiz.index, n - 1)];
    const mine = answers.find(a => a.uid === user.uid);
    const myChoice = mine && mine.answers ? mine.answers[quiz.index] : undefined;
    const board = scoreboard(quiz.questions, answers, revealedCount(quiz));
    const answeredNow = answers.filter(a => a.answers && a.answers[quiz.index] !== undefined).length;
    const shown = quiz.status === "reveal";

    body =
      quiz.status === "done" ? (
        <div className="space-y-3">
          <div className="text-[15px] font-bold">Final scores: {quiz.topic}</div>
          <Board board={board} total={n} me={user.uid} final />
          {isStaff && (
            <>
              <div className="pt-2 border-t border-[#232019]" />
              {form}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-[#8A8580]">
            <span>{quiz.topic}</span>
            <span>
              Question {quiz.index + 1} of {n}
            </span>
          </div>
          <div className="text-[16px] font-semibold leading-snug">{q.q}</div>
          <div className="space-y-2">
            {q.options.map((o, i) => {
              const picked = myChoice === i;
              const right = shown && i === q.answer;
              const wrong = shown && picked && i !== q.answer;
              return (
                <button
                  key={i}
                  onClick={() => myChoice === undefined && !shown && answer(i)}
                  disabled={myChoice !== undefined || shown}
                  className={`w-full text-left rounded-xl border px-4 py-3 text-[14px] ${
                    right ? "border-[#5FBF7A] bg-[#5FBF7A]/15" : wrong ? "border-[#E07A66] bg-[#E07A66]/15" : picked ? "border-[#C9A44C] bg-[#C9A44C]/10" : "border-[#232019] bg-[#0B0B0C]"
                  }`}
                >
                  <span className="text-[#C9A44C] font-bold mr-2">{LETTERS[i]}</span>
                  {o}
                </button>
              );
            })}
          </div>
          {myChoice !== undefined && !shown && <div className="text-[12px] text-[#C9A44C]">Answer locked in. Waiting for the reveal.</div>}
          {shown && q.why && <div className="text-[13px] text-[#B5A284]">{q.why}</div>}
          {isStaff && (
            <div className="space-y-2 pt-2 border-t border-[#232019]">
              <div className="text-[11px] text-[#8A8580]">{answeredNow} answered</div>
              {!shown ? (
                <button className={goldBtn} onClick={reveal}>
                  Reveal the answer
                </button>
              ) : quiz.index + 1 < n ? (
                <button className={goldBtn} onClick={next}>
                  Next question
                </button>
              ) : (
                <button className={goldBtn} onClick={finish}>
                  Finish and show the winner
                </button>
              )}
              {!(shown && quiz.index + 1 >= n) && (
                <button className={lineBtn} onClick={finish}>
                  End the quiz now
                </button>
              )}
            </div>
          )}
          <Board board={board} total={Math.max(1, revealedCount(quiz))} me={user.uid} />
          {error && <div className="text-[12px] text-[#E07A66]">{error}</div>}
        </div>
      );
  }

  return (
    <Sheet title="Quiz night" onClose={onClose}>
      {body}
    </Sheet>
  );
}

function Board({ board, total, me, final }) {
  if (!board.length) return <div className="text-[12px] text-[#8A8580]">No answers yet.</div>;
  return (
    <div className="rounded-xl border border-[#232019] bg-[#0B0B0C] p-3 space-y-1">
      <div className={labelCls}>Scores</div>
      {board.map((b, i) => (
        <div key={b.uid} className={`flex items-center justify-between text-[14px] ${b.uid === me ? "text-[#C9A44C] font-semibold" : ""}`}>
          <span>
            {final && i < 3 ? ["🥇", "🥈", "🥉"][i] + " " : i + 1 + ". "}
            {b.name}
          </span>
          <span>
            {b.points}/{total}
          </span>
        </div>
      ))}
    </div>
  );
}
