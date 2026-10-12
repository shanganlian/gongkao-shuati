import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Users, 
  User, 
  Play, 
  Square, 
  Award, 
  Sparkles, 
  Clock, 
  ChevronRight, 
  ShieldCheck, 
  CheckCircle2, 
  UserCheck, 
  RotateCcw,
  Eye,
  Send,
  MessageSquare,
  HelpCircle,
  TrendingUp,
  Volume2,
  Camera,
  Layers,
  Heart,
  FileText,
  AlertCircle,
  Bell,
  Scale,
  Compass,
  ArrowRight,
  Flame
} from 'lucide-react';
import { 
  InterviewRoom, 
  CandidateCard, 
  ExaminerCard, 
  AIReviewResult,
  PeerReviewFeedback,
  InterviewFormat,
  InterviewMode,
  LeaderlessDiscussionRole
} from '../types';
import { 
  MOCK_INTERVIEW_ROOMS, 
  MOCK_CANDIDATE_CARDS, 
  MOCK_EXAMINER_CARDS,
  MOCK_LEADERLESS_ROLES
} from '../data/mockData';
import { evaluateInterviewResponse } from '../services/aiService';
import { playEmotionalSpeech, stopAllSpeech } from '../services/audioService';

interface InterviewArenaProps {
  onRecordPractice: () => void;
  streakDays: number;
}

// Comparison between template cliches vs adult governance mindset
interface MindsetComparison {
  scenario: string;
  templateAnswer: string;
  templateFlaw: string;
  governanceAnswer: string;
  governanceMerit: string;
}

const COMPARISON_CASES: MindsetComparison[] = [
  {
    scenario: '基层推行政务App，部分老年人反映“手机操作难、办事闭门难进”，情绪激动。',
    templateAnswer: '“第一高度重视，第二加大宣传力度，通过拉横幅发传单提高思想认识，第三开展智能手机培训班，第四建立长效机制。”',
    templateFlaw: '假大空、学生气，无视老人不会用智能机的生理现实，企图用开会发传单忽悠群众，考官一票否决。',
    governanceAnswer: '“【体察民情】理解老人办事不易，绝不搞一刀切；【解决复杂问题】政务大厅设立老年人绿色纸质与现金保底专窗，实行‘线上走便捷、线下留温情’双轨制；【从容担当】纠偏纯线上政绩考核指标，安排网格员登门代办。”',
    governanceMerit: '直面核心矛盾，坚持为民政绩观，对策兼具法度与温度，具备成熟机关干部抓落实的闭环能力。'
  },
  {
    scenario: '多部门联合整治农贸市场乱收费，兄弟部门以“人员编制吃紧”为由推诿扯皮。',
    templateAnswer: '“第一向主管领导汇报，第二召开多部门联席协调会议，要求兄弟部门提高大局意识，第三完善考核监督扣分机制。”',
    templateFlaw: '遇到矛盾就向上级甩锅、向下级施压，满口官僚说教，缺乏成年人机关处事实操情商。',
    governanceAnswer: '“【从容担当】首问负责，现场绝不让群众受委屈；【解决复杂问题】主动登门拜访对方分管领导，带上我方牵头拟定的工作分工与免责方案，分担对方人员压力；【长效闭环】事后联合报请政府办出台联席机制，共享整治成果。”',
    governanceMerit: '有担当不推诿，懂得为协作方排忧解难，体现出极高的大局意识与协调执行定力。'
  },
  {
    scenario: '突发暴雨导致某村蔬菜滞销，农户封堵乡镇主干道要求政府包销包赔。',
    templateAnswer: '“第一迅速启动应急预案赶赴现场，第二耐心安抚群众情绪，宣讲法律法规告知封路违法，第三联系爱心企业捐款采购。”',
    templateFlaw: '教条主义，用生硬法条激化干群对立，指望外部捐款属于空中楼阁，无法从根本上救灾减损。',
    governanceAnswer: '“【体察民情】先递上一杯热水，站在菜农损失惨重的立场倾听诉求，迅速疏导交通；【解决复杂问题】立即兵分三路：联络县农产品冷链仓储兜底收储、对接商超电商开辟直采专线、协调农业保险现场理赔；【从容担当】干部带头驻点现场，给农户吃下定心丸。”',
    governanceMerit: '情绪极度稳定，临危不乱，对策层层扣紧市场规律与救灾规则，展现成年人面对复杂风险时的从容气魄。'
  }
];

export const InterviewArena: React.FC<InterviewArenaProps> = ({
  onRecordPractice,
  streakDays
}) => {
  // Navigation & Format controls
  const [activeFormat, setActiveFormat] = useState<InterviewFormat>('structured');
  const [activeMode, setActiveMode] = useState<InterviewMode>('solo_ai');
  const [phase, setPhase] = useState<'lobby' | 'matching' | 'in_session' | 'revealing' | 'report'>('lobby');

  // Active Tab inside Interview Lobby: 'rooms' | 'mindset_core' | 'comparison'
  const [lobbySubTab, setLobbySubTab] = useState<'rooms' | 'mindset_core' | 'comparison'>('rooms');

  // Selected entities
  const [selectedRoom, setSelectedRoom] = useState<InterviewRoom>(MOCK_INTERVIEW_ROOMS[0]);
  const [myCandidateCard, setMyCandidateCard] = useState<CandidateCard>(MOCK_CANDIDATE_CARDS[1]);
  const [peerCandidateCard, setPeerCandidateCard] = useState<CandidateCard>(MOCK_CANDIDATE_CARDS[0]);
  const [selectedLgdRole, setSelectedLgdRole] = useState<LeaderlessDiscussionRole>(MOCK_LEADERLESS_ROLES[1]);

  // Chamber Perspective in real exam:
  // 'chief_closeup' (主考官威严特写注视 - 训练目光对视脱敏) | 'bench_panorama' (全景7人考官席桌席)
  const [chamberPerspective, setChamberPerspective] = useState<'chief_closeup' | 'bench_panorama'>('chief_closeup');

  // Timers & Practice
  const [sessionStep, setSessionStep] = useState<'prep' | 'answering'>('prep');
  const [prepTimeLeft, setPrepTimeLeft] = useState<number>(60);
  const [answerTimeLeft, setAnswerTimeLeft] = useState<number>(180);
  const [showOneMinuteWarning, setShowOneMinuteWarning] = useState<boolean>(false);
  const [candidateNotes, setCandidateNotes] = useState<string>('');
  const [userSpokenAnswer, setUserSpokenAnswer] = useState<string>('');

  // Audio speech recognition state
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Video Camera Recording Sandbox
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState<boolean>(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoLiveRef = useRef<HTMLVideoElement>(null);
  const videoPlaybackRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);

  // AI & Peer Review Result
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [reviewResult, setReviewResult] = useState<AIReviewResult | null>(null);
  const [peerFeedback, setPeerFeedback] = useState<PeerReviewFeedback | null>(null);

  // Matchmaking animation countdown
  const [matchingSeconds, setMatchingSeconds] = useState<number>(3);

  // Score Reveal Animation
  const [revealStep, setRevealStep] = useState<number>(0);

  // Audio synthesis bell sound generator
  const playOfficialExamBell = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.2);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch {}
  };

  // Chief Examiner Voice Directives State
  const [isExaminerSpeaking, setIsExaminerSpeaking] = useState<boolean>(false);
  const examinerVoiceStopRef = useRef<(() => void) | null>(null);

  // Chief Examiner Solemn Directives TTS (High-Fidelity Emotional AI Voice)
  const speakExaminerVoice = async (text: string) => {
    if (examinerVoiceStopRef.current) {
      try { examinerVoiceStopRef.current(); } catch {}
    }
    stopAllSpeech();

    setIsExaminerSpeaking(true);
    try {
      const stopFn = await playEmotionalSpeech({
        text,
        voiceName: 'Charon',
        style: '严肃庄重、富有威严、音调沉稳大气的中国国家公务员面试正厅级主考官口吻，普通话标准，富有临场压迫感与考场仪式感，情绪真挚自然',
        onStart: () => setIsExaminerSpeaking(true),
        onEnd: () => setIsExaminerSpeaking(false),
        onError: () => setIsExaminerSpeaking(false)
      });
      examinerVoiceStopRef.current = stopFn;
    } catch {
      setIsExaminerSpeaking(false);
    }
  };

  // Prep timer countdown
  useEffect(() => {
    let timer: any;
    if (phase === 'in_session' && sessionStep === 'prep' && prepTimeLeft > 0) {
      timer = setInterval(() => {
        setPrepTimeLeft(prev => {
          if (prev <= 1) {
            setSessionStep('answering');
            speakExaminerVoice('思考时间到。考生请开始作答。');
            startAutoAnswerSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [phase, sessionStep, prepTimeLeft]);

  // Answering timer countdown
  useEffect(() => {
    let timer: any;
    if (phase === 'in_session' && sessionStep === 'answering' && answerTimeLeft > 0) {
      timer = setInterval(() => {
        setAnswerTimeLeft(prev => {
          // 60-second warning bell
          if (prev === 61) {
            setShowOneMinuteWarning(true);
            playOfficialExamBell();
            speakExaminerVoice('考生注意，距离考试结束还有一分钟。');
          }
          if (prev <= 1) {
            handleFinishAnswer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [phase, sessionStep, answerTimeLeft]);

  // Clean up media streams & speech
  useEffect(() => {
    return () => {
      stopCameraStream();
      stopAllSpeech();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
    setIsRecordingVideo(false);
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, 
        audio: true 
      });
      mediaStreamRef.current = stream;
      setIsCameraActive(true);
      if (videoLiveRef.current) {
        videoLiveRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError('未检测到可用摄像头或权限受限，已为您开启纯语音与镜面模拟模式。');
      setIsCameraActive(false);
    }
  };

  const startVideoRecording = () => {
    if (!mediaStreamRef.current) return;
    try {
      videoChunksRef.current = [];
      const recorder = new MediaRecorder(mediaStreamRef.current);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVideo(true);
    } catch (e) {
      console.warn('Video recorder error:', e);
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && isRecordingVideo) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      setIsRecordingVideo(false);
    }
  };

  // Web Speech recognition handler
  const toggleSpeechRecognition = () => {
    if (isVoiceListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsVoiceListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUserSpokenAnswer(prev => prev + (prev ? ' ' : '') + '各位考官好！针对本题，我认为必须端正为民政绩观，坚持线上线下双轨服务……');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setUserSpokenAnswer(prev => prev + (prev ? ' ' : '') + transcript);
        }
      };

      recognition.onerror = () => setIsVoiceListening(false);
      recognition.onend = () => setIsVoiceListening(false);

      recognition.start();
      recognitionRef.current = recognition;
      setIsVoiceListening(true);
    } catch {
      setIsVoiceListening(false);
    }
  };

  const startAutoAnswerSession = () => {
    if (isCameraActive && !isRecordingVideo) {
      startVideoRecording();
    }
  };

  const handleStartSession = (room: InterviewRoom) => {
    setSelectedRoom(room);
    setRecordedVideoUrl(null);
    setCandidateNotes('');
    setUserSpokenAnswer('');
    setShowOneMinuteWarning(false);

    if (activeMode === 'peer_pk') {
      setPhase('matching');
      setMatchingSeconds(3);
      const randomPeer = MOCK_CANDIDATE_CARDS.find(c => c.id !== myCandidateCard.id) || MOCK_CANDIDATE_CARDS[0];
      setPeerCandidateCard(randomPeer);

      const interval = setInterval(() => {
        setMatchingSeconds(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            initSessionState(room);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      initSessionState(room);
    }
  };

  const initSessionState = (room: InterviewRoom) => {
    setPhase('in_session');
    setSessionStep('prep');
    setPrepTimeLeft(room.promptQuestion.thinkingTimeSeconds || 60);
    setAnswerTimeLeft(room.promptQuestion.timeLimitSeconds || 180);
    setShowOneMinuteWarning(false);
    startCamera();

    // Formal Chief Examiner Opening Directive Voice
    setTimeout(() => {
      speakExaminerVoice(`考生你好，欢迎参加本次国家公务员面试。本次面试共有1道综合题，思考准备时间为1分钟，作答时间为3分钟。请考生沉着冷静，实事求是。现在请看题，考生开始思考。`);
    }, 400);
  };

  const handleFinishAnswer = async () => {
    stopVideoRecording();
    stopCameraStream();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsVoiceListening(false);

    speakExaminerVoice('考生作答完毕。请退场并在候考室等候成绩。');

    setPhase('revealing');
    setIsEvaluating(true);
    setRevealStep(0);

    const answerContent = userSpokenAnswer.trim() || candidateNotes.trim() || 
      (activeFormat === 'leaderless_group'
        ? '各位组员好！针对乡村振兴3000万专项资金分配，我作为框架搭建者，建议我们首先明确三项衡量标准：一是民生急迫性与兜底性，二是长期造血与富民带动效益，三是全县普惠性。基于此，我支持将电商冷链园区、农田水利以及养老食堂列为重点，实行专款专用与分类施策……'
        : '各位考官好！针对数字化政务与适老化冲突的问题，我认为必须端正政绩观。公职服务不能只有速度没有温度。在落实上：第一坚持线上走便捷、线下留温情双轨制；第二加快适老化改造并组织网格员上门代办；第三将群众实际满意度纳入指挥棒硬考核。回答完毕！'
      );

    setPeerFeedback({
      evaluatorName: peerCandidateCard.name,
      evaluatorArchetype: peerCandidateCard.archetype,
      standpointScoreLabel: '体察民情深刻',
      practicalFeasibility: '切实管用落地',
      encouragementNote: '“你的回答完全摒弃了空洞套话，特别是提出的双轨制建议特别接地气，没有一句废话假大空，受教了！”',
      highlightPraise: '大局观开阔、条理分明、善于站在基层群众和办事干部的角度给出可落地的制度闭环。'
    });

    setTimeout(() => setRevealStep(1), 600);
    setTimeout(() => setRevealStep(2), 1400);
    setTimeout(() => setRevealStep(3), 2200);

    const evalData = await evaluateInterviewResponse(
      selectedRoom.promptQuestion.title,
      answerContent,
      myCandidateCard.archetype
    );
    setReviewResult(evalData);
    setIsEvaluating(false);
    onRecordPractice();
  };

  const roomsForFormat = MOCK_INTERVIEW_ROOMS.filter(r => {
    if (activeFormat === 'leaderless_group') {
      return r.category.includes('无领导') || r.title.includes('无领导');
    } else {
      return !r.category.includes('无领导') && !r.title.includes('无领导');
    }
  });

  return (
    <div className="space-y-6">
      
      {/* TOP BANNER: CORE PHILOSOPHY & ANNOUNCEMENT */}
      <div className="bg-slate-900 rounded-2xl p-6 sm:p-7 border border-slate-800 shadow-xl text-white">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <Scale className="w-3.5 h-3.5 text-indigo-400" />
              <span>国家公务员及省考严肃全真面试考场 · 拒绝套话 · 执政思维早筑基</span>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              面试考查从不是背套话技巧，而是“成年人执政思维”
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              考官真正考查的是你是否具备<strong className="text-amber-400 font-bold">“体察民情、解决复杂问题、从容担当”</strong>的机关实务感。这种思维短期无法速成，<strong className="text-emerald-400 font-bold">必须尽早开始模拟开口</strong>，彻底消弭考场怯场心理，把机关实务感内化为本能肌肉记忆！
            </p>
          </div>

          {/* Quick Format & Mode Switch */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full lg:w-auto">
            <div className="flex items-center gap-1.5 p-1 bg-slate-800 rounded-xl border border-slate-700">
              <button
                onClick={() => { setActiveFormat('structured'); setPhase('lobby'); }}
                className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeFormat === 'structured' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
                }`}
              >
                结构化面试 (7人考官)
              </button>
              <button
                onClick={() => { setActiveFormat('leaderless_group'); setPhase('lobby'); }}
                className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeFormat === 'leaderless_group' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
                }`}
              >
                无领导小组讨论 (LGD)
              </button>
            </div>
          </div>
        </div>

        {/* 3 Pillars of Adult Governance Mindset (体察民情 / 解决复杂问题 / 从容担当) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-5 pt-5 border-t border-slate-800 text-xs">
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">
              民
            </div>
            <div>
              <strong className="text-white font-bold block mb-0.5">① 体察民情 (群众立场)</strong>
              <span className="text-slate-300 text-[11px] leading-relaxed">
                懂群众的苦衷与实际利益关切，有温情与换位思考，拒绝高高在上的官僚宣讲。
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 font-bold">
              事
            </div>
            <div>
              <strong className="text-white font-bold block mb-0.5">② 解决复杂问题 (实操闭环)</strong>
              <span className="text-slate-300 text-[11px] leading-relaxed">
                在有限资源与多方利益博弈中分类施策、抓痛点破死结，给出合规管用的真硬招。
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 font-bold">
              当
            </div>
            <div>
              <strong className="text-white font-bold block mb-0.5">③ 从容担当 (沉稳定力)</strong>
              <span className="text-slate-300 text-[11px] leading-relaxed">
                面对突发矛盾敢于首问负责、稳定大局，不推诿不踢皮球，展现成熟从容的执政风骨。
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION PILLS INSIDE LOBBY */}
      {phase === 'lobby' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
          <button
            onClick={() => setLobbySubTab('rooms')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              lobbySubTab === 'rooms'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>进入全真模拟考场实战</span>
          </button>

          <button
            onClick={() => setLobbySubTab('comparison')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              lobbySubTab === 'comparison'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>套话模版 vs 成人执政思维 对照拆解 (必读)</span>
          </button>

          <button
            onClick={() => setLobbySubTab('mindset_core')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              lobbySubTab === 'mindset_core'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>为什么必须早点开始开口模拟？(肌肉记忆法则)</span>
          </button>
        </div>
      )}

      {/* TAB 1: COMPARISON BETWEEN TEMPLATES & GOVERNANCE MINDSET */}
      {phase === 'lobby' && lobbySubTab === 'comparison' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-600" />
              考场高频命题：机构僵化套话 vs 成年人体制内执政思维 对比示范
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              很多考生误以为面试就是把“万能模板”背熟，一开口就是假大空。考官一听便知是应试机器，直接给60分。看看真实机关老练思维如何降维打击：
            </p>
          </div>

          <div className="space-y-4">
            {COMPARISON_CASES.map((item, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3.5">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <span className="w-6 h-6 rounded-md bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    【实战场景】：{item.scenario}
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Flawed Template Side */}
                  <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-rose-900 flex items-center gap-1">
                        ❌ 机械死记套话 (考官极其反感)
                      </span>
                      <span className="text-[10px] bg-rose-200 text-rose-800 px-2 py-0.5 rounded font-semibold">
                        典型低分 62分
                      </span>
                    </div>
                    <p className="text-xs text-rose-800 leading-relaxed font-mono">
                      {item.templateAnswer}
                    </p>
                    <div className="text-[11px] text-rose-700 pt-1 border-t border-rose-200/60">
                      <strong>考官扣分死穴：</strong> {item.templateFlaw}
                    </div>
                  </div>

                  {/* Mature Governance Mindset Side */}
                  <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-300 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-950 flex items-center gap-1">
                        ✅ 成年人执政思维 (体察民情/闭环/担当)
                      </span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-bold">
                        全场高分 88分
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900 leading-relaxed font-sans font-medium">
                      {item.governanceAnswer}
                    </p>
                    <div className="text-[11px] text-emerald-800 pt-1 border-t border-emerald-200">
                      <strong>提分核心密码：</strong> {item.governanceMerit}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center pt-2">
            <button
              onClick={() => setLobbySubTab('rooms')}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2"
            >
              <span>我已掌握执政思维，立即前往考场开口实战</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: WHY START EARLY & MUSCLE MEMORY PHILOSOPHY */}
      {phase === 'lobby' && lobbySubTab === 'mindset_core' && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-5">
          <div className="max-w-3xl space-y-2">
            <h3 className="text-lg font-black text-slate-900">
              为什么从准备初试第一天起，就必须每天模拟开口练习？
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              根据历年国考省考数据，超过 70% 的笔试高分考生在面试环节失利。主要原因不在于知识储备不够，而在于<strong>“心理怯场”</strong>与<strong>“机关实务感缺失”</strong>。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                1. 彻底消弭考场怯场心理
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                初学者面对7位表情严肃的体制内主考官，心跳加速、大脑一片空白是普遍生理反应。尽早开始对着严肃考官镜头模拟开口，每日脱敏，考场上就能如入无人之境。
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                2. 把机关实务感化为肌肉记忆
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                成年人思维方式短期内无法突击改变。只有每天开口练一题，把“先体察群众冷暖、再拿出闭环实招、最后从容担责”的语态练成脱口而出的生理反射。
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                3. 初试申论与面试同频共振
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                申论大作文的论证逻辑就是面试综合分析的底稿。开口说顺了，申论下笔自然行云流水；申论思考深了，面试开口自然高屋建瓴。
              </p>
            </div>
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={() => setLobbySubTab('rooms')}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2"
            >
              <span>立即开始今日3分钟开口演练</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: THE MAIN INTERVIEW LOBBY & ROOM SELECTION */}
      {phase === 'lobby' && lobbySubTab === 'rooms' && (
        <div className="space-y-6">
          {/* Mode Selector (Solo AI vs Peer PK) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-900">演练对战模式：</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium border border-slate-200">
                <button
                  onClick={() => setActiveMode('solo_ai')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    activeMode === 'solo_ai' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>自行与 严肃AI主考官 深度实战</span>
                </button>
                <button
                  onClick={() => setActiveMode('peer_pk')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    activeMode === 'peer_pk' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>组队同行 PK (双向互评 · 拒显高分)</span>
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              {activeMode === 'solo_ai' ? (
                <span>🛡️ 正厅级主考官全景严肃考场，支持反复自录复盘与反模板诊断</span>
              ) : (
                <span>🤝 真实考友同行互励，<strong className="text-emerald-700">绝不展示他人高分，拒绝内卷焦虑</strong></span>
              )}
            </div>
          </div>

          {/* Leaderless Group Discussion Role Selector */}
          {activeFormat === 'leaderless_group' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">无领导小组讨论 · 战术定位卡</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    在无领导讨论中，清晰的团队角色定位是脱颖而出的核心
                  </p>
                </div>
                <span className="text-xs text-emerald-700 font-semibold">四大人格战术</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {MOCK_LEADERLESS_ROLES.map((role) => {
                  const isSelected = selectedLgdRole.roleId === role.roleId;
                  return (
                    <button
                      key={role.roleId}
                      onClick={() => setSelectedLgdRole(role)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">{role.title}</div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mt-1">
                        {role.description}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-emerald-800 font-mono">
                        {role.keyResponsibility}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Candidate Persona Cards */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">选择你的对练实务风格人设卡</h3>
                <p className="text-xs text-slate-400 mt-0.5">人设卡决定AI阅卷官重点审视的思维长板与破局视角</p>
              </div>
              <span className="text-xs text-slate-400">4大公职实干风格</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {MOCK_CANDIDATE_CARDS.map((card) => {
                const isSelected = myCandidateCard.id === card.id;
                return (
                  <button
                    key={card.id}
                    onClick={() => setMyCandidateCard(card)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100">
                        <img src={card.avatarUrl} alt={card.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{card.name}</div>
                        <div className="text-[11px] text-emerald-700 font-semibold">{card.title}</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {card.signatureStyle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Examiner Panel Preview (Authentic 7-Examiner Composition) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  官方标准化考场 · 严肃考官评委席构成
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  还原国家公职面试标准配置：正厅级主考官领衔，专职纪检监督与计时记分
                </p>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                标准考官长桌阵容
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {MOCK_EXAMINER_CARDS.map((ex) => (
                <div key={ex.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-300 shrink-0">
                      <img src={ex.avatarUrl} alt={ex.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-900">{ex.name}</div>
                      <div className="text-[10px] text-indigo-700 font-bold">{ex.role}</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                    {ex.styleDescription}
                  </p>
                  <div className="text-[10px] text-slate-500 border-t border-slate-200/80 pt-1 font-mono">
                    审视重点：{ex.focus}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Exam Rooms Selection Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {activeFormat === 'structured' ? '结构化面试全真考场题本' : '无领导小组讨论全真实战题本'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  精选国考、省考及事业编历年高频真题，直击基层治理与应急处突
                </p>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                共 {roomsForFormat.length} 个考场开放中
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roomsForFormat.map((room) => (
                <div 
                  key={room.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-slate-400 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                        {room.examType}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {room.category}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 leading-snug">
                      {room.title}
                    </h4>

                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                      {room.promptQuestion.title}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{Math.round(room.promptQuestion.timeLimitSeconds / 60)} 分钟实战</span>
                    </div>

                    <button
                      onClick={() => handleStartSession(room)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {activeMode === 'solo_ai' ? '进入严肃考场实战' : '匹配考友同行对练'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: MATCHMAKING ANIMATION (FOR PEER PK) */}
      {phase === 'matching' && (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-xs text-center space-y-6 max-w-lg mx-auto">
          <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-indigo-400/40 animate-ping" />
            <div className="absolute inset-2 rounded-full border border-indigo-500/60 animate-pulse" />
            <div className="w-20 h-20 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-2xl shadow-lg font-mono">
              {matchingSeconds}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900">
              正在全网匹配实力相近的备考同行者...
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              遵循“按部就班就是伟大”原则，系统将完全屏蔽对方历史分数，营造零焦虑备考环境。
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200">
            演练考题：{selectedRoom.title}
          </div>
        </div>
      )}

      {/* PHASE 3: ULTRA-REALISTIC FORMAL IN-SESSION EXAM CHAMBER */}
      {phase === 'in_session' && (
        <div className="space-y-4">
          
          {/* Chamber Header & Perspective Toggles */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-900">考场视点：</span>
              
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium border border-slate-200">
                <button
                  onClick={() => setChamberPerspective('chief_closeup')}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                    chamberPerspective === 'chief_closeup' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="直视主考官目光，训练对视脱敏"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>主考官威严注视特写 (脱敏对视)</span>
                </button>

                <button
                  onClick={() => setChamberPerspective('bench_panorama')}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                    chamberPerspective === 'bench_panorama' ? 'bg-slate-900 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="全景考官长桌视角"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>7人考官席全景长桌</span>
                </button>
              </div>

              {/* Examiner Voice Replay & Speaking Indicator Button */}
              <button
                onClick={() => {
                  if (isExaminerSpeaking) {
                    stopAllSpeech();
                    setIsExaminerSpeaking(false);
                  } else {
                    if (sessionStep === 'prep') {
                      speakExaminerVoice('考生请听题：考生思考准备时间为1分钟，回答时间为3分钟。现在开始计时，请思考。');
                    } else {
                      speakExaminerVoice('时间到，考生请作答。');
                    }
                  }
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                  isExaminerSpeaking
                    ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse shadow-xs'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title="重新播放或暂停主考官威严原声口令"
              >
                <Volume2 className={`w-3.5 h-3.5 ${isExaminerSpeaking ? 'text-slate-950' : 'text-indigo-600'}`} />
                <span>{isExaminerSpeaking ? '正在播报主考官口令 (点击停止)' : '重播主考官口令'}</span>
              </button>
            </div>

            {/* Official Digital Timers Display */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600">
                {sessionStep === 'prep' ? '审题思考倒计时' : '考场正式作答倒计时'}：
              </span>
              <div className={`px-4 py-1.5 rounded-xl font-mono font-black text-base tabular-nums border ${
                sessionStep === 'prep' 
                  ? 'bg-amber-50 text-amber-900 border-amber-300' 
                  : (answerTimeLeft <= 60 ? 'bg-rose-600 text-white border-rose-700 animate-pulse' : 'bg-slate-900 text-white border-slate-900')
              }`}>
                {sessionStep === 'prep'
                  ? `00:${String(prepTimeLeft).padStart(2, '0')}`
                  : `${Math.floor(answerTimeLeft / 60)}:${String(answerTimeLeft % 60).padStart(2, '0')}`
                }
              </div>

              {sessionStep === 'prep' && (
                <button
                  onClick={() => {
                    setSessionStep('answering');
                    speakExaminerVoice('考生已准备完毕，请开始作答。');
                    startAutoAnswerSession();
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-2xs"
                >
                  提前思考完毕 · 开口作答
                </button>
              )}
            </div>
          </div>

          {/* 1-Minute Warning Banner (Official Bell Alert) */}
          {showOneMinuteWarning && sessionStep === 'answering' && (
            <div className="p-3 bg-rose-600 text-white rounded-xl shadow-lg flex items-center justify-between text-xs animate-bounce font-bold">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-300 animate-spin" />
                <span>【考场举牌鸣钟警示】：考生注意，距离考试结束还有 1 分钟！请注意总结收尾。</span>
              </div>
              <span className="text-[11px] underline cursor-pointer" onClick={() => setShowOneMinuteWarning(false)}>
                知道了
              </span>
            </div>
          )}

          {/* MAIN FORMAL EXAM STAGE BOARD */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* Left Column: Serious Chamber Simulation Scene (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-900 shadow-2xl text-white relative">
                
                {/* Official Chamber Wall Plaque / Banner */}
                <div className="bg-red-800 text-white text-center py-1.5 px-4 text-xs font-black tracking-widest border-b border-red-900 shadow-md">
                  ★ 国家公务员录用考试面试考场 · 严守考纪 · 规范评定 · 公平公正 ★
                </div>

                {/* Scene View: Chief Examiner Closeup OR Full Bench Panorama */}
                <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-slate-900">
                  {chamberPerspective === 'chief_closeup' ? (
                    <img
                      src="/src/assets/images/chief_examiner_closeup_serious_1791641370871.jpg"
                      alt="主考官严肃注视特写"
                      className="w-full h-full object-cover object-top opacity-95 transition-opacity"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <img
                      src="/src/assets/images/official_civil_exam_chamber_bench_1791641337645.jpg"
                      alt="考官席全景长桌"
                      className="w-full h-full object-cover opacity-90 transition-opacity"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  {/* Gradient vignette for formal cinematic realism */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40 pointer-events-none" />

                  {/* Live Chamber Behavior Status Indicator */}
                  <div className={`absolute top-3 left-3 backdrop-blur-md px-3 py-1.5 rounded-lg border text-[11px] flex items-center gap-2 transition-all ${
                    isExaminerSpeaking 
                      ? 'bg-amber-950/90 border-amber-400 text-amber-200 shadow-md ring-1 ring-amber-400/50' 
                      : 'bg-black/75 border-white/10 text-slate-200'
                  }`}>
                    {isExaminerSpeaking ? (
                      <div className="flex items-center gap-1 h-3">
                        <span className="w-1 h-2 bg-amber-400 animate-pulse rounded-full" />
                        <span className="w-1 h-3.5 bg-amber-300 animate-bounce rounded-full" />
                        <span className="w-1 h-2 bg-amber-400 animate-pulse rounded-full" />
                      </div>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <span className="font-medium">
                      {isExaminerSpeaking 
                        ? '🔊 正厅级主考官正在庄严宣读官方考场口令中...'
                        : (sessionStep === 'prep' 
                            ? '考官席静候中：请抓紧审题搭建论点提纲' 
                            : '主考官正专注于您的眼神交流与执政逻辑')}
                    </span>
                  </div>

                  {/* Examiner Nameplate Floating at bottom of stage */}
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px]">
                    <div className="px-3 py-1 rounded bg-slate-900/90 backdrop-blur-md border border-slate-700 text-amber-300 font-bold flex items-center gap-1.5 shadow-sm">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>主考官：张巡视员 (正厅级命题组组长)</span>
                    </div>

                    <div className="px-3 py-1 rounded bg-slate-900/90 backdrop-blur-md border border-slate-700 text-slate-300 text-[10px] font-mono hidden sm:block">
                      考生席座位编号：01号
                    </div>
                  </div>
                </div>

                {/* Candidate Desk Question Book & Task */}
                <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-amber-400">
                    <span className="font-bold flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      【考生席题本】：{selectedRoom.promptQuestion.title}
                    </span>
                    <span className="text-slate-400 text-[11px] font-mono">
                      {activeFormat === 'leaderless_group' ? `定位：${selectedLgdRole.title}` : '综合分析实务题'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    {selectedRoom.promptQuestion.task}
                  </p>

                  {activeFormat === 'leaderless_group' && (
                    <div className="p-2.5 bg-indigo-950/60 rounded-lg text-[11px] text-indigo-200 border border-indigo-900">
                      <strong className="text-indigo-400">无领导定位口诀：</strong> {selectedLgdRole.speakingTactic}
                    </div>
                  )}
                </div>
              </div>

              {/* Scratchpad & Spoken Input Sandbox */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    草稿纸提纲构思与作答录入
                  </span>

                  {/* Speech input toggle */}
                  <button
                    onClick={toggleSpeechRecognition}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isVoiceListening 
                        ? 'bg-rose-600 text-white animate-pulse shadow-xs' 
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
                    }`}
                  >
                    {isVoiceListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    <span>{isVoiceListening ? '正在收音转录中 (点击停止)' : '开启语音实时输入'}</span>
                  </button>
                </div>

                <textarea
                  value={userSpokenAnswer}
                  onChange={(e) => setUserSpokenAnswer(e.target.value)}
                  placeholder={
                    sessionStep === 'prep'
                      ? '【审题草稿纸】：第一步定性立意（体现体察民情）……第二步剖析本质矛盾……第三步提出闭环实务对策（抓落实有担当）……'
                      : '【考场正式作答】：面对考官开口发言。系统实时将语音录入转写为文字……作答完毕请说“回答完毕”。'
                  }
                  rows={5}
                  className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500 font-mono">
                    已录入 {userSpokenAnswer.length} 字
                  </span>

                  <button
                    onClick={handleFinishAnswer}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    回答完毕 · 提交考官阅卷复盘
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Video Mirror Sandbox & Examiner Criteria (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Video Camera Mirror Sandbox */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    考场仪态镜与视频录制自检
                  </span>

                  <div className="flex items-center gap-1">
                    {isCameraActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        摄像头正常
                      </span>
                    )}
                  </div>
                </div>

                {/* Mirror container */}
                <div className="relative aspect-4/3 rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-300">
                  <video
                    ref={videoLiveRef}
                    autoPlay
                    muted
                    playsInline
                    className={`w-full h-full object-cover scale-x-[-1] ${isCameraActive ? 'block' : 'hidden'}`}
                  />

                  {!isCameraActive && (
                    <div className="text-center p-6 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center mx-auto">
                        <VideoOff className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-300 font-bold">考场仪态视频镜未启动</p>
                        <p className="text-[11px] text-slate-500 max-w-xs">
                          开启摄像头可同步录制作答视频，考后回放自查眼神交流与微表情
                        </p>
                      </div>
                      <button
                        onClick={startCamera}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                      >
                        开启摄像头
                      </button>
                    </div>
                  )}

                  {isRecordingVideo && (
                    <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded bg-rose-600/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      <span>正在录制自检视频...</span>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}

                <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  💡 <strong>仪态脱敏要领：</strong>挺胸抬头、目光直视主考官眼神、手自然平放于桌面、语调沉稳坚定，消除游离与背诵感。
                </div>
              </div>

              {/* 3 Core Scoring Dimensions (Civil Service Adult Mindset) */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <span className="text-xs font-bold text-slate-900 block">
                  考官席核心打分标尺（成年人执政思维）：
                </span>
                
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-emerald-950 font-bold block">1. 体察民情深度 (拒空话)</strong>
                      <span className="text-emerald-800 text-[11px]">能够站在老百姓的办事难处思考，有共情与换位温度。</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-indigo-950 font-bold block">2. 解决复杂问题能力 (抓闭环)</strong>
                      <span className="text-indigo-800 text-[11px]">在有限经费与编制下分类施策，拿出体制内管用硬招。</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-950 font-bold block">3. 从容担当气魄 (定力)</strong>
                      <span className="text-amber-800 text-[11px]">不推诿、不踢皮球，临危不乱，首问负责。</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 4: SCORE REVEAL ANIMATION (Anti-Anxiety: No opponent score shown!) */}
      {phase === 'revealing' && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs text-center space-y-6 max-w-xl mx-auto">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>考官评卷与同伴互评生成中</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              按部就班就是伟大 · 双方共勉揭晓
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              为了消除焦虑与内卷，系统<strong className="text-slate-800">绝不展示对方的分数</strong>。只呈现对彼此的闪光点认可与你的专属执政雷达诊断。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-left">
            <div className={`p-4 rounded-xl border transition-all duration-500 ${revealStep >= 1 ? 'border-emerald-500 bg-emerald-50/40 translate-y-0 opacity-100' : 'translate-y-4 opacity-50'}`}>
              <div className="text-xs font-bold text-slate-900 mb-1">你的执政思维评定</div>
              <div className="text-lg font-black text-emerald-700">
                {isEvaluating ? '考官审阅中...' : reviewResult?.overallGrade || '良好'}
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                坚持打卡 <strong className="text-slate-800">{streakDays}</strong> 天
              </div>
            </div>

            <div className={`p-4 rounded-xl border transition-all duration-500 ${revealStep >= 2 ? 'border-amber-400 bg-amber-50/40 translate-y-0 opacity-100' : 'translate-y-4 opacity-50'}`}>
              <div className="text-xs font-bold text-slate-900 mb-1">同伴共勉信</div>
              <div className="text-sm font-bold text-amber-900">
                ★ 获得“按部就班”同行勋章
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                “思维开阔，举措落地很实，共同上岸！”
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setPhase('report')}
              disabled={isEvaluating}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {isEvaluating ? '资深主考官正在撰写深度报告...' : '查阅完整复盘、视频回放与反套话诊断'}
            </button>
          </div>
        </div>
      )}

      {/* PHASE 5: COMPREHENSIVE AI REVIEW REPORT */}
      {phase === 'report' && reviewResult && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6 max-w-4xl mx-auto">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">
                {activeFormat === 'leaderless_group' ? '无领导小组讨论 · 团队复盘报告' : '结构化面试 · 资深主考官官方复盘报告'}
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                {selectedRoom.promptQuestion.title}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">综合等级：</span>
              <span className="px-3.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-black text-sm">
                {reviewResult.overallGrade}
              </span>
            </div>
          </div>

          {/* Video Playback Sandbox */}
          {recordedVideoUrl && (
            <div className="p-4 bg-slate-900 rounded-2xl text-white space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <Video className="w-4 h-4" />
                  你本次面试的完整作答录像回放 (考场仪态与眼神自检)
                </span>
                <span className="text-slate-400 text-[11px]">可随时暂停复盘小动作与停顿卡点</span>
              </div>

              <div className="max-w-md mx-auto aspect-4/3 rounded-xl overflow-hidden bg-black">
                <video
                  ref={videoPlaybackRef}
                  src={recordedVideoUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* 4 Adult Governance Mindset Scores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] text-slate-500 block">体察民情与政治站位</span>
              <span className="text-xl font-black text-slate-900 font-mono tabular-nums">
                {reviewResult.policyAlignmentScore}
              </span>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] text-slate-500 block">复杂矛盾解构条理</span>
              <span className="text-xl font-black text-slate-900 font-mono tabular-nums">
                {reviewResult.logicStructureScore}
              </span>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] text-slate-500 block">沉着表达与实务感</span>
              <span className="text-xl font-black text-slate-900 font-mono tabular-nums">
                {reviewResult.expressionFluencyScore}
              </span>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] text-slate-500 block">举措可行性与从容担当</span>
              <span className="text-xl font-black text-slate-900 font-mono tabular-nums">
                {reviewResult.practicalActionScore}
              </span>
            </div>
          </div>

          {/* Peer Review Box (Encouragement Only) */}
          {activeMode === 'peer_pk' && peerFeedback && (
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-950 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-700" />
                  考友同行互评反馈 ({peerFeedback.evaluatorName})
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-medium text-[11px]">
                  互评站位：{peerFeedback.standpointScoreLabel} · {peerFeedback.practicalFeasibility}
                </span>
              </div>

              <p className="text-xs text-amber-900 leading-relaxed font-serif italic">
                {peerFeedback.encouragementNote}
              </p>

              <div className="text-[11px] text-amber-800">
                <strong>同伴眼中的你的高光：</strong> {peerFeedback.highlightPraise}
              </div>
            </div>
          )}

          {/* Chief Examiner's Overall Summary */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <strong className="text-slate-900 block mb-1">【正厅级主考官阅评总评】：</strong>
            {reviewResult.summaryComment}
          </div>

          {/* Anti-Template Warning Room */}
          {reviewResult.antiTemplateWarning && (
            <div className="p-4 bg-rose-50/70 border border-rose-300 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-rose-900 font-bold">
                <Scale className="w-4 h-4 text-rose-600" />
                <span>考官反套话与反机械模板诊断：</span>
              </div>
              <p className="text-rose-800 leading-relaxed">
                {reviewResult.antiTemplateWarning}
              </p>
            </div>
          )}

          {/* Highlights & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
              <h5 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                执政思维高光亮点：
              </h5>
              <ul className="space-y-1.5 text-xs text-emerald-900">
                {reviewResult.highlights.map((h, i) => (
                  <li key={i} className="leading-relaxed">• {h}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2">
              <h5 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                机关实操提分建议：
              </h5>
              <ul className="space-y-1.5 text-xs text-amber-900">
                {reviewResult.improvementSuggestions.map((tip, i) => (
                  <li key={i} className="leading-relaxed">• {tip}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* High Score Model Framework */}
          <div className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs space-y-2">
            <span className="font-semibold text-emerald-400 block">【体制内高分实务答题结构范本】：</span>
            <pre className="font-sans whitespace-pre-wrap leading-relaxed text-slate-300">
              {reviewResult.modelAnswerFramework}
            </pre>
          </div>

          {/* Anti-Anxiety Message */}
          <div className="p-4 bg-emerald-600 text-white rounded-xl text-center text-xs space-y-1 shadow-sm">
            <span className="font-bold block">【行岸公考暖心寄语】：</span>
            <p className="leading-relaxed italic">
              {reviewResult.antiAnxietyEncouragement}
            </p>
          </div>

          {/* Back to Lobby */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setPhase('lobby')}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl cursor-pointer"
            >
              返回面试大厅继续演练
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
