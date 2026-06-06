import { useState, useEffect, useRef } from "react";
import { auth, db, rtdb, googleProvider } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { ref, push, onValue, serverTimestamp } from "firebase/database";

// ─── Design System ────────────────────────────────────────────────────────────
const C = {
  bg: "#FAFAF8",
  surface: "#FFFFFF",
  ink: "#160C00",
  ink2: "#5C4B3A",
  ink3: "#A8998A",
  accent: "#C4622D",
  accentLight: "#FDF0E8",
  border: "#EDE8E2",
  gold: "#A07840",
  success: "#2A6041",
  red: "#B83232",
  women: "#C4622D",   // terracotta for women features
  men: "#2A4A6A",     // navy for men features
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const PROFILES = [
  {
    id:"p1", name:"Ariana", age:26, city:"Jakarta", job:"Graphic Designer",
    gender:"woman", verified:true, coins:2450, gifts:47, likedUser:true, matchScore:92,
    photos:["https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&q=80"],
    prompts:[
      { q:"The way to my heart is...", a:"Honest conversations over really good coffee at 7am." },
      { q:"A non-negotiable for me...", a:"Sunday mornings with zero plans and perfect light." },
    ],
  },
  {
    id:"p2", name:"Rizky", age:29, city:"Bandung", job:"Software Engineer",
    gender:"man", verified:false, coins:890, gifts:12, likedUser:false, matchScore:78,
    photos:["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80"],
    prompts:[
      { q:"I'm looking for...", a:"Someone who can keep up with my terrible music taste." },
      { q:"My simple pleasures...", a:"Cold brew, good code, guitar after midnight." },
    ],
  },
  {
    id:"p3", name:"Cinta", age:24, city:"Jakarta", job:"Photographer",
    gender:"woman", verified:true, coins:5200, gifts:83, likedUser:true, matchScore:85,
    photos:["https://images.unsplash.com/photo-1488716820095-cbe80883c496?w=600&q=80"],
    prompts:[
      { q:"Life is better when...", a:"You find something beautiful in the ordinary." },
      { q:"My love language is...", a:"Acts of service. I'll notice everything you do." },
    ],
  },
  {
    id:"p4", name:"Dimas", age:31, city:"Bali", job:"Architect",
    gender:"man", verified:true, coins:1780, gifts:29, likedUser:false, matchScore:70,
    photos:["https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80"],
    prompts:[
      { q:"My perfect day...", a:"Surf at dawn. Design until noon. Local food with good people." },
    ],
  },
  {
    id:"p5", name:"Maya", age:27, city:"Jakarta", job:"Marketing",
    gender:"woman", verified:true, coins:3100, gifts:61, likedUser:true, matchScore:88,
    photos:["https://images.unsplash.com/photo-1502767882563-62a3523e4e0b?w=600&q=80"],
    prompts:[
      { q:"I'm weirdly passionate about...", a:"Airport lounges and the ritual of going somewhere new." },
      { q:"Green flags I look for...", a:"Someone who asks follow-up questions." },
    ],
  },
];

const GIFTS = [
  { id:"g1", name:"Rose", icon:"🌹", coins:10, desc:"Classic & timeless" },
  { id:"g2", name:"Coffee", icon:"☕", coins:15, desc:"For the morning person" },
  { id:"g3", name:"Wine", icon:"🍷", coins:35, desc:"Let's celebrate" },
  { id:"g4", name:"Champagne", icon:"🍾", coins:60, desc:"Special occasion" },
  { id:"g5", name:"Ring", icon:"💍", coins:100, desc:"Make it meaningful" },
  { id:"g6", name:"Diamond", icon:"💎", coins:200, desc:"The ultimate" },
];

const COIN_PACKS = [
  { coins:100, price:0.99, label:"Starter", bonus:0 },
  { coins:500, price:3.99, label:"Popular", bonus:50, popular:true },
  { coins:1200, price:7.99, label:"Value", bonus:200 },
  { coins:3000, price:17.99, label:"Best Deal", bonus:800 },
];

const TIMER_OPTIONS = [
  { label:"No timer", hours:0, desc:"Match stays open forever" },
  { label:"24 hours", hours:24, desc:"He has to wait for you" },
  { label:"48 hours", hours:48, desc:"A little more time" },
  { label:"72 hours", hours:72, desc:"No rush" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("splash");
  const [tab, setTab] = useState("discover");
  const [subScreen, setSubScreen] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [form, setForm] = useState({ email:"", password:"", name:"", age:"", city:"Jakarta", gender:"" });
  const [authError, setAuthError] = useState("");
  const [setupStep, setSetupStep] = useState(1);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [plan, setPlan] = useState("free");
  const [coins, setCoins] = useState(150);
  const [passed, setPassed] = useState([]);
  const [liked, setLiked] = useState({});
  const [showMatch, setShowMatch] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [selectedGiftProfile, setSelectedGiftProfile] = useState(null);
  const [notification, setNotification] = useState(null);
  const [likingTarget, setLikingTarget] = useState(null);
  const [likeComment, setLikeComment] = useState("");
  // Women-choose system
  const [pendingApprovals, setPendingApprovals] = useState([
    // Mock: men who liked current user (if woman)
    { id:"req1", profile:PROFILES[1], likedAt:Date.now()-3600000, comment:"Loved your answer about coffee ☕", timer:24 },
    { id:"req2", profile:PROFILES[3], likedAt:Date.now()-7200000, comment:"", timer:0 },
  ]);
  const [approvedMatches, setApprovedMatches] = useState([]);
  const [showApproveModal, setShowApproveModal] = useState(null);
  const [selectedTimer, setSelectedTimer] = useState(0);
  const [myTimer, setMyTimer] = useState(24); // woman's default timer setting

  const fileInputRef = useRef(null);
  const msgEndRef = useRef(null);

  const activeProfiles = PROFILES.filter(p => !passed.includes(p.id));
  const isWoman = userProfile?.gender === "woman";
  const isMan = userProfile?.gender === "man";
  const isGold = plan === "gold" || plan === "platinum";

  // Helper: time remaining
  const timeRemaining = (likedAt, timerHours) => {
    if (!timerHours) return null;
    const expires = likedAt + timerHours * 3600000;
    const remaining = expires - Date.now();
    if (remaining <= 0) return "Expired";
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  };

  useEffect(() => {
    const timeout = setTimeout(() => { setLoading(false); setScreen("auth"); }, 5000);
    const unsub = onAuthStateChanged(auth, async (u) => {
      clearTimeout(timeout);
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) { setUserProfile(snap.data()); setScreen("app"); }
          else setScreen("setup");
        } catch(e) { setScreen("setup"); }
      } else { setScreen("auth"); }
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  useEffect(() => {
    if (!activeChat || !user) return;
    const chatId = [user.uid, activeChat.id].sort().join("_");
    const unsub = onValue(ref(rtdb, `chats/${chatId}`), snap => {
      const data = snap.val();
      setMessages(data ? Object.values(data).sort((a,b)=>(a.ts||0)-(b.ts||0)) : []);
    });
    return () => unsub();
  }, [activeChat, user]);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3500); };

  const handleAuth = async () => {
    setAuthError("");
    try {
      if (authMode==="register") await createUserWithEmailAndPassword(auth, form.email, form.password);
      else await signInWithEmailAndPassword(auth, form.email, form.password);
    } catch(e) {
      const msgs = { "auth/user-not-found":"Email not found", "auth/wrong-password":"Wrong password", "auth/email-already-in-use":"Email already registered", "auth/weak-password":"Password must be 6+ characters", "auth/invalid-email":"Invalid email", "auth/invalid-credential":"Incorrect email or password" };
      setAuthError(msgs[e.code] || "Something went wrong");
    }
  };

  const handleGoogle = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch(e) { setAuthError("Google sign-in failed"); }
  };

  const handleSetup = async () => {
    if (!form.name || !form.age || !form.gender) { setAuthError("Please fill all fields"); return; }
    if (parseInt(form.age) < 18) { setAuthError("You must be 18 or older"); return; }
    setUploading(true);
    let photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name)}&background=C4622D&color=fff&size=400&bold=true`;
    if (photoFile) {
      try {
        const fd = new FormData();
        fd.append("file", photoFile);
        fd.append("upload_preset", "nosingle_uploads");
        fd.append("folder", "nosingle/profiles");
        const res = await fetch(`https://api.cloudinary.com/v1_1/dvw2c6lp0/image/upload`, { method:"POST", body:fd });
        const data = await res.json();
        if (data.secure_url) photoUrl = data.secure_url;
      } catch(e) {}
    }
    const profile = { uid:user.uid, name:form.name, age:parseInt(form.age), city:form.city, gender:form.gender, email:user.email, photo:photoUrl, coins:150, gifts:0, verified:false, createdAt:new Date().toISOString() };
    try { await setDoc(doc(db, "users", user.uid), profile); setUserProfile(profile); setScreen("app"); }
    catch(e) { setAuthError("Failed to save: " + e.message); }
    setUploading(false);
  };

  const likeProfile = (profile, type, index) => {
    if (isMan) {
      // Man likes → goes to woman's approval queue
      setLikingTarget({ profile, type, index });
      setLikeComment("");
    } else {
      // Woman likes → direct match if mutual
      setLikingTarget({ profile, type, index });
      setLikeComment("");
    }
  };

  const confirmLike = () => {
    if (!likingTarget) return;
    const { profile } = likingTarget;

    if (isMan) {
      // Man's like → pending approval
      setLiked(p => ({ ...p, [profile.id]: { status:"pending", comment:likeComment } }));
      showNotif(`Like sent to ${profile.name}! She'll be notified 💌`);
    } else {
      // Woman's like → check if man liked her too
      const isMatch = profile.likedUser;
      setLiked(p => ({ ...p, [profile.id]: { status:"approved", comment:likeComment } }));
      if (isMatch) {
        setMatchedProfile(profile);
        setTimeout(() => setShowMatch(true), 300);
      } else {
        showNotif(`You liked ${profile.name}! 💕`);
      }
    }
    setLikingTarget(null);
  };

  const approveRequest = (req) => {
    setApprovedMatches(p => [...p, req.profile]);
    setPendingApprovals(p => p.filter(r => r.id !== req.id));
    setShowApproveModal(null);
    setMatchedProfile(req.profile);
    setTimeout(() => setShowMatch(true), 300);
  };

  const declineRequest = (req) => {
    setPendingApprovals(p => p.filter(r => r.id !== req.id));
    setShowApproveModal(null);
    showNotif("Declined quietly. They won't be notified.");
  };

  const passProfile = (profile) => {
    setPassed(p => [...p, profile.id]);
  };

  const sendMsg = async () => {
    if (!msgInput.trim() || !activeChat || !user) return;

    // Women-first check: if man is trying to chat with woman who hasn't approved
    if (isMan) {
      const isApproved = approvedMatches.some(m => m.id === activeChat.id) || activeChat.likedUser;
      if (!isApproved) { showNotif("Wait for her to approve first 💌"); return; }
    }

    const chatId = [user.uid, activeChat.id].sort().join("_");
    const t = new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });
    try {
      await push(ref(rtdb, `chats/${chatId}`), { text:msgInput, from:user.uid, time:t, ts:serverTimestamp() });
      setMsgInput("");
      const replies = ["That's really sweet 😊", "Ha, I love that!", "Tell me more?", "Okay now I need the full story 👀", "You're funny, I like this."];
      setTimeout(async () => {
        await push(ref(rtdb, `chats/${chatId}`), { text:replies[Math.floor(Math.random()*replies.length)], from:activeChat.id, time:new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}), ts:serverTimestamp() });
      }, 1500);
    } catch(e) {}
  };

  const sendGift = (gift) => {
    if (!selectedGiftProfile) { showNotif("Select someone first"); return; }
    if (coins < gift.coins) { showNotif("Not enough coins"); setSubScreen("coins"); return; }
    setCoins(c => c - gift.coins);
    showNotif(`${gift.icon} ${gift.name} sent to ${selectedGiftProfile.name}!`);
  };

  // ── LOADING ──
  if (loading) return (
    <div style={{...s.root, alignItems:"center", justifyContent:"center"}}>
      <style>{css}</style>
      <div style={s.brandHero}><span style={{color:C.ink}}>No</span><span style={{color:"#E8735A",fontStyle:"italic"}}>Single</span></div>
      <div style={{fontSize:13, color:C.ink3, marginTop:8, letterSpacing:3, textTransform:"uppercase"}}>Find your person</div>
      <div style={{display:"flex", gap:6, marginTop:32}}>
        {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:3,background:C.accent,animation:`dot 1.2s ${i*0.2}s infinite`}}/>)}
      </div>
    </div>
  );

  // ── AUTH ──
  if (screen==="auth") return (
    <div style={{...s.root, justifyContent:"space-between", padding:"64px 28px 48px"}}>
      <style>{css}</style>
      <div>
        <div style={s.brandHero} className="fade-up"><span style={{color:C.ink}}>No</span><span style={{color:"#E8735A",fontStyle:"italic"}}>Single</span></div>
        <div style={{fontSize:15, color:C.ink2, marginTop:10, lineHeight:1.7}} className="fade-up">
          Women choose first.<br/>Real connections, by design.
        </div>
      </div>
      <div className="fade-up">
        <div style={{display:"flex", background:C.border, borderRadius:14, padding:3, gap:3, marginBottom:0}}>
          {["login","register"].map(m=>(
            <button key={m} style={{flex:1,padding:"12px",border:"none",borderRadius:11,cursor:"pointer",fontSize:14,fontWeight:500,background:authMode===m?C.surface:"transparent",color:authMode===m?C.ink:C.ink3,transition:"all 0.2s",fontFamily:"inherit"}}
              onClick={()=>{setAuthMode(m);setAuthError("");}}>
              {m==="login"?"Sign In":"Create Account"}
            </button>
          ))}
        </div>
        <div style={{background:C.surface,borderRadius:"0 0 20px 20px",padding:"20px 20px 24px",boxShadow:`0 8px 32px rgba(22,12,0,0.07)`}}>
          <input type="email" placeholder="Email address" style={s.inp} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
          <input type="password" placeholder="Password" style={{...s.inp,marginBottom:0}} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/>
          {authError && <div style={{fontSize:13,color:C.red,marginTop:10,textAlign:"center"}}>{authError}</div>}
          <button style={{...s.btnPrimary,marginTop:16}} onClick={handleAuth}>{authMode==="login"?"Sign In":"Create Account"}</button>
          <div style={{display:"flex",alignItems:"center",gap:12,margin:"8px 0"}}>
            <div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:12,color:C.ink3}}>or</span><div style={{flex:1,height:1,background:C.border}}/>
          </div>
          <button style={s.btnGoogle} onClick={handleGoogle}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );

  // ── SETUP ──
  if (screen==="setup") return (
    <div style={{...s.root,padding:"48px 28px 32px"}}>
      <style>{css}</style>
      <div style={{display:"flex",gap:4,marginBottom:36}}>
        {[1,2].map(i=><div key={i} style={{flex:1,height:2,borderRadius:1,background:i<=setupStep?C.ink:C.border,transition:"background 0.3s"}}/>)}
      </div>
      {setupStep===1 && (
        <div className="fade-up">
          <div style={s.setupH}>Add your photo</div>
          <div style={s.setupSub}>Profiles with photos get 3x more connections.</div>
          <div style={{display:"flex",justifyContent:"center",margin:"40px 0"}}>
            <div style={{width:160,height:160,borderRadius:80,border:`2px dashed ${C.border}`,cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:C.surface}} onClick={()=>fileInputRef.current?.click()}>
              {photoPreview?<img src={photoPreview} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<div style={{textAlign:"center"}}><div style={{fontSize:36,color:C.border}}>+</div><div style={{fontSize:12,color:C.ink3,marginTop:6}}>Add photo</div></div>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);const r=new FileReader();r.onload=ev=>setPhotoPreview(ev.target.result);r.readAsDataURL(f);}}}/>
          </div>
          <button style={s.btnPrimary} onClick={()=>setSetupStep(2)}>Continue</button>
          <button style={s.btnGhost} onClick={()=>setSetupStep(2)}>Skip for now</button>
        </div>
      )}
      {setupStep===2 && (
        <div className="fade-up">
          <div style={s.setupH}>About you</div>
          <div style={s.setupSub}>This is what others will see first.</div>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:28}}>
            <input placeholder="Nickname *" style={s.inp} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
            <input type="number" placeholder="Age *" style={s.inp} value={form.age} min="18" onChange={e=>setForm(p=>({...p,age:e.target.value}))}/>
            <select style={s.inp} value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}>
              <option value="">I am a... *</option>
              <option value="woman">Woman</option>
              <option value="man">Man</option>
              <option value="nonbinary">Non-binary</option>
              <option value="other">Other</option>
            </select>
            <select style={{...s.inp}} value={form.city} onChange={e=>setForm(p=>({...p,city:e.target.value}))}>
              <optgroup label="🇮🇩 Indonesia">
                {["Jakarta","Bandung","Surabaya","Bali/Denpasar","Yogyakarta","Medan","Semarang","Makassar","Palembang","Tangerang","Bekasi","Bogor","Malang","Batam","Pekanbaru"].map(c=><option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="🌏 Asia Pacific">
                {["Singapore","Kuala Lumpur","Penang","Johor Bahru","Manila","Cebu","Bangkok","Chiang Mai","Ho Chi Minh City","Hanoi","Phnom Penh","Yangon","Sydney","Melbourne","Brisbane","Perth","Auckland","Wellington","Tokyo","Osaka","Kyoto","Seoul","Busan","Beijing","Shanghai","Guangzhou","Shenzhen","Hong Kong","Taipei","Mumbai","Delhi","Bangalore","Chennai"].map(c=><option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="🌍 Middle East">
                {["Dubai","Abu Dhabi","Sharjah","Riyadh","Jeddah","Doha","Kuwait City","Manama","Muscat","Beirut","Istanbul"].map(c=><option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="🌍 Europe">
                {["London","Manchester","Paris","Berlin","Amsterdam","Madrid","Barcelona","Rome","Milan","Zurich","Vienna","Stockholm","Copenhagen","Oslo","Helsinki","Brussels","Lisbon","Athens","Warsaw","Prague","Budapest"].map(c=><option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="🌎 Americas">
                {["New York","Los Angeles","Chicago","Houston","Miami","San Francisco","Seattle","Boston","Toronto","Vancouver","Montreal","São Paulo","Rio de Janeiro","Mexico City","Buenos Aires","Bogotá"].map(c=><option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="🌍 Africa">
                {["Nairobi","Lagos","Cape Town","Cairo","Casablanca","Accra","Addis Ababa","Dar es Salaam"].map(c=><option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>
            <input placeholder="Or type your city..." style={{...s.inp,marginBottom:0}} onChange={e=>{if(e.target.value) setForm(p=>({...p,city:e.target.value}))}}/>
          </div>
          {/* Women-first explanation */}
          {form.gender==="woman" && (
            <div style={{background:"#FDF0E8",borderRadius:14,padding:"14px 16px",marginTop:16,border:`1px solid ${C.accent}20`}}>
              <div style={{fontSize:13,fontWeight:600,color:C.accent,marginBottom:4}}>👑 You're in control</div>
              <div style={{fontSize:12,color:C.ink2,lineHeight:1.6}}>On NoSingle, women approve connections first. Men can like you, but chat only opens when you say yes.</div>
            </div>
          )}
          {form.gender==="man" && (
            <div style={{background:"#EEF2F7",borderRadius:14,padding:"14px 16px",marginTop:16}}>
              <div style={{fontSize:13,fontWeight:600,color:C.men,marginBottom:4}}>💌 How it works for you</div>
              <div style={{fontSize:12,color:C.ink2,lineHeight:1.6}}>You can like anyone. If she's interested, she'll approve — and chat opens for both of you.</div>
            </div>
          )}
          {authError && <div style={{fontSize:13,color:C.red,marginTop:12,textAlign:"center"}}>{authError}</div>}
          <div style={{display:"flex",gap:10,marginTop:24}}>
            <button style={{...s.btnGhost,flex:1,marginBottom:0}} onClick={()=>setSetupStep(1)}>Back</button>
            <button style={{...s.btnPrimary,flex:2,marginBottom:0}} onClick={handleSetup} disabled={uploading}>
              {uploading?"Saving...":"Start Exploring"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── LIKE MODAL ──
  if (likingTarget) return (
    <div style={{...s.root,background:"rgba(22,12,0,0.65)",backdropFilter:"blur(20px)",justifyContent:"flex-end"}}>
      <style>{css}</style>
      <div style={{background:C.surface,borderRadius:"24px 24px 0 0",padding:"28px 24px 48px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <img src={likingTarget.profile.photos[0]} style={{width:52,height:52,borderRadius:26,objectFit:"cover"}} alt=""/>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.ink}}>{likingTarget.profile.name}</div>
            <div style={{fontSize:12,color:C.ink3}}>
              {isMan ? "She'll be notified when you like her" : "Send a like"}
            </div>
          </div>
        </div>
        <div style={{fontSize:13,color:C.ink2,marginBottom:12}}>Add a comment (optional)</div>
        <input style={{...s.inp,marginBottom:16}} placeholder={isMan?"Say something genuine...":"What caught your attention?"} value={likeComment} onChange={e=>setLikeComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&confirmLike()}/>

        {/* Timer setting for women */}
        {!isMan && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:13,color:C.ink2,marginBottom:10}}>⏰ Give him a response window?</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {TIMER_OPTIONS.map(t=>(
                <button key={t.hours} style={{padding:"7px 12px",borderRadius:10,border:`1px solid ${selectedTimer===t.hours?C.accent:C.border}`,background:selectedTimer===t.hours?C.accentLight:C.surface,fontSize:12,color:selectedTimer===t.hours?C.accent:C.ink2,cursor:"pointer",fontFamily:"inherit"}}
                  onClick={()=>setSelectedTimer(t.hours)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button style={s.btnPrimary} onClick={confirmLike}>
          {isMan ? "Send Like 💌" : "Like ♥"}
        </button>
        <button style={s.btnGhost} onClick={()=>setLikingTarget(null)}>Cancel</button>
      </div>
    </div>
  );

  // ── APPROVE MODAL (for women) ──
  if (showApproveModal) return (
    <div style={{...s.root,background:"rgba(22,12,0,0.65)",backdropFilter:"blur(20px)",justifyContent:"flex-end"}}>
      <style>{css}</style>
      <div style={{background:C.surface,borderRadius:"24px 24px 0 0",padding:"28px 24px 48px"}}>
        <div style={{fontSize:13,color:C.ink3,marginBottom:4,letterSpacing:1,textTransform:"uppercase"}}>Someone likes you</div>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
          <img src={showApproveModal.profile.photos[0]} style={{width:64,height:64,borderRadius:32,objectFit:"cover"}} alt=""/>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:C.ink}}>{showApproveModal.profile.name}, {showApproveModal.profile.age}</div>
            <div style={{fontSize:13,color:C.ink3}}>{showApproveModal.profile.job} · {showApproveModal.profile.city}</div>
          </div>
        </div>

        {showApproveModal.comment && (
          <div style={{background:C.bg,borderRadius:14,padding:"14px 16px",marginBottom:20,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:12,color:C.ink3,marginBottom:4}}>He said:</div>
            <div style={{fontSize:14,color:C.ink,lineHeight:1.6,fontStyle:"italic"}}>"{showApproveModal.comment}"</div>
          </div>
        )}

        {/* Timer info */}
        {showApproveModal.timer > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"10px 14px",background:"#FFF8F0",borderRadius:12,border:`1px solid ${C.border}`}}>
            <span style={{fontSize:16}}>⏰</span>
            <div style={{fontSize:12,color:C.ink2}}><strong>{timeRemaining(showApproveModal.likedAt, showApproveModal.timer)}</strong> to respond</div>
          </div>
        )}

        {/* View his profile */}
        <button style={{...s.btnGhost,marginBottom:12}} onClick={()=>{setViewingProfile(showApproveModal.profile);setShowApproveModal(null);setSubScreen("viewProfile");}}>
          View Full Profile →
        </button>

        <div style={{display:"flex",gap:10}}>
          <button style={{...s.btnGhost,flex:1,marginBottom:0,color:C.red,borderColor:C.red}} onClick={()=>declineRequest(showApproveModal)}>
            ✕ Decline
          </button>
          <button style={{...s.btnPrimary,flex:2,marginBottom:0}} onClick={()=>approveRequest(showApproveModal)}>
            ♥ Approve & Chat
          </button>
        </div>
        <button style={{...s.btnGhost,marginTop:10,marginBottom:0,fontSize:13,color:C.ink3}} onClick={()=>setShowApproveModal(null)}>
          Decide later
        </button>
      </div>
    </div>
  );

  // ── PROFILE FULL VIEW ──
  if (subScreen==="viewProfile" && viewingProfile) return (
    <div style={{...s.root,background:C.bg}}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={{flex:1,overflowY:"auto",paddingBottom:120}}>
        {viewingProfile.photos.map((photo,pi)=>(
          <div key={pi}>
            <div style={{position:"relative",height:480}}>
              <img src={photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
              {pi===0 && (
                <>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(22,12,0,0.85) 0%,transparent 55%)"}}/>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"24px 20px 20px"}}>
                    <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:4}}>
                      <div style={{fontSize:28,fontWeight:700,color:"white"}}>{viewingProfile.name}</div>
                      <div style={{fontSize:19,color:"rgba(255,255,255,0.75)",marginBottom:2}}>{viewingProfile.age}</div>
                      {viewingProfile.verified && <div style={{marginBottom:3,fontSize:10,color:"white",background:"rgba(255,255,255,0.2)",borderRadius:6,padding:"2px 8px"}}>✓</div>}
                    </div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,0.65)"}}>{viewingProfile.job} · {viewingProfile.city}</div>
                    <div style={{display:"flex",gap:10,marginTop:8}}>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>🎁 {viewingProfile.gifts}</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>✦ {viewingProfile.coins.toLocaleString()}</div>
                    </div>
                  </div>
                </>
              )}
              <button style={s.likePhotoBtn} onClick={()=>likeProfile(viewingProfile,"photo",pi)}>
                {liked[viewingProfile.id]?"❤️":"🤍"}
              </button>
            </div>
            {viewingProfile.prompts[pi] && (
              <div style={{...s.promptBlock,margin:"12px 20px 0"}}>
                <div style={{fontSize:11,color:C.ink3,marginBottom:6,fontStyle:"italic"}}>{viewingProfile.prompts[pi].q}</div>
                <div style={{fontSize:15,fontWeight:500,color:C.ink,lineHeight:1.6}}>{viewingProfile.prompts[pi].a}</div>
                <button style={s.likePromptBtn} onClick={()=>likeProfile(viewingProfile,"prompt",pi)}>
                  {liked[viewingProfile.id]?"❤️":"🤍"} Like this answer
                </button>
              </div>
            )}
          </div>
        ))}
        {viewingProfile.prompts.slice(viewingProfile.photos.length).map((prompt,pi)=>(
          <div key={pi} style={{...s.promptBlock,margin:"12px 20px 0"}}>
            <div style={{fontSize:11,color:C.ink3,marginBottom:6,fontStyle:"italic"}}>{prompt.q}</div>
            <div style={{fontSize:15,fontWeight:500,color:C.ink,lineHeight:1.6}}>{prompt.a}</div>
            <button style={s.likePromptBtn} onClick={()=>likeProfile(viewingProfile,"prompt",pi)}>
              {liked[viewingProfile.id]?"❤️":"🤍"} Like this answer
            </button>
          </div>
        ))}
      </div>
      <div style={s.profileActions}>
        <button style={s.passBtn} onClick={()=>{passProfile(viewingProfile);setSubScreen(null);}}>✕ Pass</button>
        <button style={s.giftBtnSm} onClick={()=>{setSelectedGiftProfile(viewingProfile);setSubScreen("gift");}}>🎁</button>
        <button style={s.likeBtn} onClick={()=>likeProfile(viewingProfile,"profile",0)}>
          {isMan?"♥ Like — She'll Approve":"♥ Like"}
        </button>
      </div>
      <button style={{position:"fixed",top:16,left:16,background:"rgba(250,250,248,0.92)",border:"none",borderRadius:20,width:40,height:40,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,backdropFilter:"blur(8px)"}} onClick={()=>setSubScreen(null)}>←</button>
    </div>
  );

  // ── CHAT ──
  if (subScreen==="chat" && activeChat) return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"rgba(250,250,248,0.95)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:10}}>
        <button style={{background:"none",border:"none",fontSize:22,color:C.ink,cursor:"pointer"}} onClick={()=>setSubScreen(null)}>←</button>
        <img src={activeChat.photos[0]} style={{width:38,height:38,borderRadius:19,objectFit:"cover"}} alt=""/>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:600,color:C.ink}}>{activeChat.name}</div>
          <div style={{fontSize:11,color:C.ink3}}>
            {isWoman?"You approved this match":"She approved this match"} · Active now
          </div>
        </div>
        <button style={{background:"none",border:"none",fontSize:20,cursor:"pointer"}} onClick={()=>{setSelectedGiftProfile(activeChat);setSubScreen("gift");}}>🎁</button>
      </div>

      {/* Women-first reminder for men */}
      {isMan && (
        <div style={{padding:"10px 16px",background:"#EEF2F7",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.men,textAlign:"center"}}>
          💌 She approved your connection. Chat is now open for both of you.
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
        {messages.length===0 && (
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:48,marginBottom:12}}>{isWoman?"👑":"💌"}</div>
            <div style={{fontSize:13,color:C.ink3,lineHeight:1.7}}>
              {isWoman ? `You approved ${activeChat.name}'s connection request.\nYou go first — it's your move.` : `${activeChat.name} approved your request.\nSay something genuine.`}
            </div>
          </div>
        )}
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",flexDirection:"column",maxWidth:"75%",alignSelf:m.from===user?.uid?"flex-end":"flex-start",alignItems:m.from===user?.uid?"flex-end":"flex-start"}}>
            <div style={m.from===user?.uid?s.bubbleMe:s.bubbleThem}>{m.text}</div>
            <div style={{fontSize:10,color:C.ink3,marginTop:4}}>{m.time}</div>
          </div>
        ))}
        <div ref={msgEndRef}/>
      </div>
      <div style={{display:"flex",gap:10,padding:"10px 16px 20px",background:C.surface,borderTop:`1px solid ${C.border}`,alignItems:"center"}}>
        <input style={s.msgInp} placeholder="Write something..." value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()}/>
        <button style={s.sendBtn} onClick={sendMsg}>↑</button>
      </div>
    </div>
  );

  // ── GIFT SHOP ──
  if (subScreen==="gift") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={s.pageHdr}>
        <button style={s.backBtn} onClick={()=>setSubScreen(null)}>←</button>
        <div style={s.pageHdrTitle}>Send a Gift</div>
        <div style={{fontSize:13,fontWeight:600,color:C.gold}}>✦ {coins}</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
        <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:C.ink3,marginBottom:12}}>Send to</div>
        <div style={{display:"flex",gap:12,marginBottom:24,overflowX:"auto",paddingBottom:4}}>
          {PROFILES.map(p=>(
            <div key={p.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}} onClick={()=>setSelectedGiftProfile(p)}>
              <div style={{padding:2,borderRadius:28,border:`2px solid ${selectedGiftProfile?.id===p.id?C.accent:"transparent"}`,transition:"border 0.2s"}}>
                <img src={p.photos[0]} style={{width:54,height:54,borderRadius:24,objectFit:"cover",display:"block"}} alt={p.name}/>
              </div>
              <span style={{fontSize:11,color:selectedGiftProfile?.id===p.id?C.accent:C.ink2,fontWeight:selectedGiftProfile?.id===p.id?600:400}}>{p.name}</span>
            </div>
          ))}
        </div>
        <div style={{background:C.surface,borderRadius:16,padding:16,marginBottom:20,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:12,color:C.ink3}}>Your coins</div><div style={{fontSize:22,fontWeight:700,color:C.gold}}>✦ {coins}</div></div>
          <button style={{...s.btnPrimary,width:"auto",padding:"8px 16px",marginBottom:0,fontSize:12}} onClick={()=>setSubScreen("coins")}>Top up</button>
        </div>
        <div style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:C.ink3,marginBottom:12}}>Choose a gift</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {GIFTS.map(g=>(
            <div key={g.id} style={{background:C.surface,borderRadius:16,padding:"18px 16px",cursor:"pointer",border:`1px solid ${C.border}`}} onClick={()=>sendGift(g)}>
              <div style={{fontSize:32,marginBottom:8}}>{g.icon}</div>
              <div style={{fontSize:14,fontWeight:600,color:C.ink}}>{g.name}</div>
              <div style={{fontSize:12,color:C.ink3,marginTop:2}}>{g.desc}</div>
              <div style={{fontSize:12,color:C.gold,marginTop:6,fontWeight:600}}>✦ {g.coins}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── COINS ──
  if (subScreen==="coins") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={s.pageHdr}>
        <button style={s.backBtn} onClick={()=>setSubScreen(null)}>←</button>
        <div style={s.pageHdrTitle}>Get Coins</div>
        <div style={{width:32}}/>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
        <div style={{background:`linear-gradient(135deg,${C.ink},#3D2B1A)`,borderRadius:20,padding:24,marginBottom:24,color:"white",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:8}}>✦</div>
          <div style={{fontSize:32,fontWeight:700}}>{coins}</div>
          <div style={{fontSize:13,opacity:0.6,marginTop:4}}>NoSingle Coins</div>
        </div>
        {COIN_PACKS.map((pack,i)=>(
          <div key={i} style={{background:C.surface,borderRadius:16,padding:16,marginBottom:10,border:`1.5px solid ${pack.popular?C.ink:C.border}`,cursor:"pointer",position:"relative"}}
            onClick={()=>{setCoins(c=>c+pack.coins+pack.bonus);showNotif(`✦ +${pack.coins+pack.bonus} coins added!`);setSubScreen(null);}}>
            {pack.popular && <div style={{position:"absolute",top:-10,right:16,background:C.ink,color:"white",fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:10}}>POPULAR</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:C.gold}}>✦ {pack.coins.toLocaleString()} coins</div>
                {pack.bonus>0 && <div style={{fontSize:12,color:C.success,marginTop:2}}>+ {pack.bonus} bonus</div>}
                <div style={{fontSize:12,color:C.ink3,marginTop:1}}>{pack.label}</div>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:C.ink}}>${pack.price}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── PREMIUM ──
  if (subScreen==="premium") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={s.pageHdr}>
        <button style={s.backBtn} onClick={()=>setSubScreen(null)}>←</button>
        <div style={s.pageHdrTitle}>Membership</div>
        <div style={{width:32}}/>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px 40px"}}>
        <div style={{background:`linear-gradient(135deg,${C.ink} 0%,#3D2B1A 100%)`,borderRadius:20,padding:28,marginBottom:20,color:"white"}}>
          <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",opacity:0.5,marginBottom:10}}>NoSingle</div>
          <div style={{fontSize:26,fontWeight:700,lineHeight:1.3}}>Find better,<br/>faster.</div>
          <div style={{fontSize:13,opacity:0.6,marginTop:10,lineHeight:1.6}}>Unlock every feature and meet people who match your life.</div>
        </div>
        {[
          { id:"gold",name:"Gold",badge:"✦",price:"$5.99",period:"/month",color:C.gold,
            features:["See everyone who likes you","5 Super Likes per day","Undo last pass","Gold badge","No ads"] },
          { id:"platinum",name:"Platinum",badge:"◆",price:"$9.99",period:"/month",color:C.ink,popular:true,
            features:["Everything in Gold","Unlimited Super Likes","Video & voice calls","Read receipts","Priority in discovery","Platinum badge"] },
        ].map(p=>(
          <div key={p.id} style={{background:C.surface,borderRadius:20,padding:20,marginBottom:12,border:`1.5px solid ${p.popular?C.ink:C.border}`,position:"relative"}}>
            {p.popular && <div style={{position:"absolute",top:-10,left:20,background:C.ink,color:"white",fontSize:10,fontWeight:600,letterSpacing:1,textTransform:"uppercase",padding:"3px 12px",borderRadius:10}}>Most Popular</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:p.color}}>{p.badge} {p.name}</div>
                <div style={{fontSize:22,fontWeight:700,color:C.ink,marginTop:4}}>{p.price}<span style={{fontSize:13,fontWeight:400,color:C.ink3}}>{p.period}</span></div>
              </div>
              <button style={{background:p.popular?C.ink:C.surface,border:`1.5px solid ${C.ink}`,borderRadius:12,padding:"10px 20px",color:p.popular?"white":C.ink,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{setPlan(p.id);setSubScreen(null);showNotif(`${p.badge} ${p.name} activated!`);}}>
                Select
              </button>
            </div>
            {p.features.map(f=>(
              <div key={f} style={{display:"flex",gap:10,padding:"5px 0",fontSize:13,color:C.ink2}}>
                <span style={{color:C.success}}>✓</span>{f}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  // ── MAIN APP ──
  return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}

      {/* Header */}
      <header style={s.hdr}>
        <div style={s.brand}><span style={{color:C.ink}}>No</span><span style={{color:"#E8735A",fontStyle:"italic"}}>Single</span></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Women badge */}
          {isWoman && <div style={{fontSize:11,fontWeight:600,color:C.accent,background:C.accentLight,borderRadius:8,padding:"3px 8px"}}>👑 You choose</div>}
          {plan!=="free" && <span style={{fontSize:12,color:C.gold,fontWeight:600}}>{plan==="platinum"?"◆":"✦"}</span>}
          <div style={{fontSize:13,fontWeight:600,color:C.gold,cursor:"pointer"}} onClick={()=>setSubScreen("coins")}>✦ {coins}</div>
          <img src={userProfile?.photo||`https://ui-avatars.com/api/?name=${userProfile?.name||"U"}&background=C4622D&color=fff`} style={{width:34,height:34,borderRadius:17,objectFit:"cover",border:`1.5px solid ${C.border}`,cursor:"pointer"}} alt="me" onClick={()=>setTab("profile")}/>
        </div>
      </header>

      <main style={s.main}>

        {/* ── DISCOVER ── */}
        {tab==="discover" && (
          <div>
            {/* Women: pending approvals banner */}
            {isWoman && pendingApprovals.length > 0 && (
              <div style={{margin:"16px 20px 0",background:C.accentLight,borderRadius:16,padding:"14px 16px",border:`1px solid ${C.accent}30`}}>
                <div style={{fontSize:13,fontWeight:600,color:C.accent,marginBottom:10}}>
                  👑 {pendingApprovals.length} {pendingApprovals.length===1?"person likes":"people like"} you
                </div>
                <div style={{display:"flex",gap:8,overflowX:"auto"}}>
                  {pendingApprovals.map(req=>(
                    <div key={req.id} style={{flexShrink:0,cursor:"pointer"}} onClick={()=>setShowApproveModal(req)}>
                      <div style={{position:"relative"}}>
                        <img src={req.profile.photos[0]} style={{width:56,height:56,borderRadius:28,objectFit:"cover",border:`2px solid ${C.accent}`}} alt=""/>
                        {req.timer>0 && (
                          <div style={{position:"absolute",bottom:-2,left:"50%",transform:"translateX(-50%)",background:C.ink,color:"white",fontSize:9,fontWeight:600,padding:"2px 5px",borderRadius:6,whiteSpace:"nowrap"}}>
                            {timeRemaining(req.likedAt,req.timer)}
                          </div>
                        )}
                      </div>
                      <div style={{fontSize:10,color:C.ink2,textAlign:"center",marginTop:6}}>{req.profile.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Man: pending status */}
            {isMan && Object.keys(liked).length > 0 && (
              <div style={{margin:"16px 20px 0",background:"#EEF2F7",borderRadius:14,padding:"12px 16px"}}>
                <div style={{fontSize:13,color:C.men}}>
                  💌 {Object.keys(liked).length} like{Object.keys(liked).length>1?"s":""} sent — waiting for her response
                </div>
              </div>
            )}

            <div style={{padding:"16px 20px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:C.ink3}}>{activeProfiles.filter(p=>p.gender!==userProfile?.gender).length} profiles nearby</div>
              <button style={{fontSize:12,fontWeight:600,color:plan==="free"?C.accent:C.gold,background:"none",border:`1px solid ${plan==="free"?C.accent:C.gold}`,borderRadius:12,padding:"5px 12px",cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setSubScreen("premium")}>
                {plan==="free"?"Upgrade":"✦ "+plan}
              </button>
            </div>

            {/* Profile feed */}
            {activeProfiles.map(profile=>(
              <div key={profile.id} style={{marginBottom:24}}>
                {/* Photo card */}
                <div style={{position:"relative",height:460,margin:"0 20px",borderRadius:20,overflow:"hidden",boxShadow:`0 4px 24px rgba(22,12,0,0.1)`}}>
                  <img src={profile.photos[0]} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={profile.name}/>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(22,12,0,0.8) 0%,transparent 50%)"}}/>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px"}}>
                    <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:4}}>
                      <div style={{fontSize:26,fontWeight:700,color:"white"}}>{profile.name}</div>
                      <div style={{fontSize:18,color:"rgba(255,255,255,0.75)",marginBottom:2}}>{profile.age}</div>
                      {profile.verified && <div style={{marginBottom:2,fontSize:10,color:"white",background:"rgba(255,255,255,0.2)",borderRadius:6,padding:"2px 8px"}}>✓</div>}
                    </div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,0.65)"}}>{profile.job} · {profile.city}</div>
                  </div>
                  <button style={s.likePhotoBtn} onClick={()=>likeProfile(profile,"photo",0)}>
                    {liked[profile.id]?"❤️":"🤍"}
                  </button>
                </div>

                {/* First prompt */}
                {profile.prompts[0] && (
                  <div style={{...s.promptBlock,margin:"10px 20px 0"}}>
                    <div style={{fontSize:11,color:C.ink3,marginBottom:6,fontStyle:"italic"}}>{profile.prompts[0].q}</div>
                    <div style={{fontSize:15,fontWeight:500,color:C.ink,lineHeight:1.6}}>{profile.prompts[0].a}</div>
                    <button style={s.likePromptBtn} onClick={()=>likeProfile(profile,"prompt",0)}>
                      {liked[profile.id]?"❤️":"🤍"} Like this
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div style={{display:"flex",gap:10,margin:"10px 20px 0",alignItems:"center"}}>
                  <button style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"12px",fontSize:13,fontWeight:500,color:C.ink,cursor:"pointer",fontFamily:"inherit"}}
                    onClick={()=>{setViewingProfile(profile);setSubScreen("viewProfile");}}>
                    See full profile →
                  </button>
                  <button style={{width:44,height:44,borderRadius:22,background:C.surface,border:`1px solid ${C.border}`,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                    onClick={()=>passProfile(profile)}>✕</button>
                  <button style={{width:44,height:44,borderRadius:22,background:C.surface,border:`1px solid ${C.border}`,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                    onClick={()=>{setSelectedGiftProfile(profile);setSubScreen("gift");}}>🎁</button>
                </div>
              </div>
            ))}

            {activeProfiles.length===0 && (
              <div style={{textAlign:"center",padding:"80px 32px"}}>
                <div style={{fontSize:40,marginBottom:16}}>✦</div>
                <div style={{fontSize:20,fontWeight:700,color:C.ink,marginBottom:8}}>You've seen everyone</div>
                <div style={{fontSize:14,color:C.ink2}}>Check back later for new profiles.</div>
              </div>
            )}
          </div>
        )}

        {/* ── MATCHES ── */}
        {tab==="matches" && (
          <div style={{padding:"20px"}}>
            <div style={{fontSize:22,fontWeight:700,color:C.ink,marginBottom:4}}>Connections</div>
            <div style={{fontSize:13,color:C.ink2,marginBottom:20}}>
              {isWoman?"You control who can chat with you":"Waiting for her to approve"}
            </div>

            {/* Women: pending approvals */}
            {isWoman && pendingApprovals.length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:C.ink3,marginBottom:12}}>Waiting for your approval</div>
                {pendingApprovals.map(req=>(
                  <div key={req.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px",background:C.surface,borderRadius:16,marginBottom:10,border:`1px solid ${C.border}`,cursor:"pointer"}}
                    onClick={()=>setShowApproveModal(req)}>
                    <img src={req.profile.photos[0]} style={{width:58,height:58,borderRadius:29,objectFit:"cover",flexShrink:0}} alt=""/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:16,fontWeight:600,color:C.ink}}>{req.profile.name}, {req.profile.age}</div>
                      <div style={{fontSize:12,color:C.ink3,marginTop:2}}>{req.profile.city}</div>
                      {req.comment && <div style={{fontSize:12,color:C.ink2,marginTop:4,fontStyle:"italic"}}>"{req.comment.slice(0,50)}{req.comment.length>50?"...":""}"</div>}
                      {req.timer>0 && <div style={{fontSize:11,color:C.accent,marginTop:4}}>⏰ {timeRemaining(req.likedAt,req.timer)}</div>}
                    </div>
                    <div style={{fontSize:12,fontWeight:600,color:C.accent}}>Review →</div>
                  </div>
                ))}
              </div>
            )}

            {/* Men: likes sent */}
            {isMan && Object.keys(liked).length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:C.ink3,marginBottom:12}}>Likes sent</div>
                {PROFILES.filter(p=>liked[p.id]).map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px",background:C.surface,borderRadius:16,marginBottom:10,border:`1px solid ${C.border}`}}>
                    <img src={p.photos[0]} style={{width:58,height:58,borderRadius:29,objectFit:"cover",filter:"none"}} alt=""/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:16,fontWeight:600,color:C.ink}}>{p.name}, {p.age}</div>
                      <div style={{fontSize:12,color:C.ink3,marginTop:2}}>{p.city}</div>
                      <div style={{fontSize:12,color:C.ink3,marginTop:4}}>⏳ Waiting for her to approve</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Approved matches / chats */}
            {approvedMatches.length > 0 && (
              <div>
                <div style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:C.ink3,marginBottom:12}}>Active chats</div>
                {approvedMatches.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}
                    onClick={()=>{setActiveChat(p);setMessages([]);setSubScreen("chat");}}>
                    <img src={p.photos[0]} style={{width:58,height:58,borderRadius:29,objectFit:"cover"}} alt=""/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:16,fontWeight:600,color:C.ink}}>{p.name}, {p.age}</div>
                      <div style={{fontSize:12,color:C.success,marginTop:2}}>✓ Approved · {p.city}</div>
                    </div>
                    <span style={{color:C.border,fontSize:18}}>›</span>
                  </div>
                ))}
              </div>
            )}

            {isWoman && pendingApprovals.length===0 && approvedMatches.length===0 && (
              <div style={{textAlign:"center",padding:"48px 0",color:C.ink3}}>
                <div style={{fontSize:40,marginBottom:12}}>👑</div>
                <div style={{fontSize:13,lineHeight:1.7}}>When someone likes you,<br/>they'll appear here for your approval.</div>
              </div>
            )}

            {isMan && Object.keys(liked).length===0 && (
              <div style={{textAlign:"center",padding:"48px 0",color:C.ink3}}>
                <div style={{fontSize:40,marginBottom:12}}>💌</div>
                <div style={{fontSize:13,lineHeight:1.7}}>Like someone in Discover.<br/>If she's interested, she'll approve.</div>
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE ── */}
        {tab==="profile" && (
          <div style={{paddingBottom:80}}>
            <div style={{position:"relative",height:300}}>
              <img src={userProfile?.photo||`https://ui-avatars.com/api/?name=${userProfile?.name||"U"}&background=C4622D&color=fff&size=400`} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="me"/>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(22,12,0,0.8) 0%,transparent 50%)"}}/>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 24px"}}>
                <div style={{fontSize:26,fontWeight:700,color:"white"}}>{userProfile?.name}, {userProfile?.age}</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,0.65)",marginTop:4}}>{userProfile?.city}</div>
                {isWoman && <div style={{fontSize:12,color:C.accent,marginTop:4,background:"rgba(196,98,45,0.2)",borderRadius:8,padding:"2px 8px",display:"inline-block"}}>👑 Women Choose</div>}
              </div>
            </div>

            <div style={{padding:"20px 24px"}}>
              {/* Women timer setting */}
              {isWoman && (
                <div style={{background:C.accentLight,borderRadius:16,padding:16,marginBottom:20,border:`1px solid ${C.accent}20`}}>
                  <div style={{fontSize:14,fontWeight:600,color:C.accent,marginBottom:8}}>⏰ Your default timer</div>
                  <div style={{fontSize:12,color:C.ink2,marginBottom:10}}>How long do men have to wait for your response?</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {TIMER_OPTIONS.map(t=>(
                      <button key={t.hours} style={{padding:"6px 12px",borderRadius:10,border:`1px solid ${myTimer===t.hours?C.accent:C.border}`,background:myTimer===t.hours?C.accent:"white",fontSize:12,color:myTimer===t.hours?"white":C.ink2,cursor:"pointer",fontFamily:"inherit"}}
                        onClick={()=>{setMyTimer(t.hours);showNotif(`Default timer: ${t.label}`);}}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div style={{display:"flex",borderRadius:16,overflow:"hidden",border:`1px solid ${C.border}`,background:C.surface,marginBottom:20}}>
                {[[isWoman?pendingApprovals.length:Object.keys(liked).length,isWoman?"Waiting":"Likes Sent"],[coins,"Coins"],[plan==="free"?"Free":plan,"Plan"]].map(([n,l],i)=>(
                  <div key={l} style={{flex:1,padding:"16px 8px",textAlign:"center",borderRight:i<2?`1px solid ${C.border}`:"none"}}>
                    <div style={{fontSize:18,fontWeight:700,color:C.ink}}>{n}</div>
                    <div style={{fontSize:10,color:C.ink3,marginTop:2,textTransform:"uppercase",letterSpacing:0.5}}>{l}</div>
                  </div>
                ))}
              </div>

              {[
                ["Membership",plan==="free"?"Upgrade your experience":"Active: "+plan,()=>setSubScreen("premium"),plan==="free"],
                ["Get Coins",`Balance: ✦ ${coins}`,()=>setSubScreen("coins"),false],
                ["Gift Shop","Send something meaningful",()=>setSubScreen("gift"),false],
                ["Edit Profile","Update your info",()=>showNotif("Coming soon!"),false],
                ["Privacy & Safety","Manage your account",()=>showNotif("Coming soon!"),false],
              ].map(([label,sub,action,highlight])=>(
                <div key={label} style={{display:"flex",alignItems:"center",padding:"16px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}} onClick={action}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,color:highlight?C.accent:C.ink}}>{label}</div>
                    <div style={{fontSize:12,color:C.ink3,marginTop:2}}>{sub}</div>
                  </div>
                  <span style={{color:C.border,fontSize:18}}>›</span>
                </div>
              ))}

              <button style={{...s.btnGhost,marginTop:24,color:C.red,borderColor:C.red}} onClick={()=>signOut(auth)}>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Match popup */}
      {showMatch && matchedProfile && (
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(22,12,0,0.75)",backdropFilter:"blur(20px)"}} className="fade-up">
          <div style={{background:C.surface,borderRadius:"24px 24px 0 0",width:"100%",maxWidth:430,padding:"36px 28px 48px",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
              <img src={userProfile?.photo||""} style={{width:70,height:70,borderRadius:35,objectFit:"cover",border:`3px solid ${C.surface}`,zIndex:2}} alt="me"/>
              <img src={matchedProfile.photos[0]} style={{width:70,height:70,borderRadius:35,objectFit:"cover",border:`3px solid ${C.surface}`,marginLeft:-16}} alt="match"/>
            </div>
            <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:C.ink3,marginBottom:8}}>
              {isWoman?"You approved — it's a match!":"She approved — it's a match!"}
            </div>
            <div style={{fontSize:24,fontWeight:700,color:C.ink,marginBottom:8}}>You and {matchedProfile.name}</div>
            <div style={{fontSize:14,color:C.ink2,marginBottom:28,lineHeight:1.6}}>
              {isWoman?"You're in control. Say hello whenever you're ready.":"She approved your request. Don't keep her waiting."}
            </div>
            <button style={s.btnPrimary} onClick={()=>{setShowMatch(false);setApprovedMatches(p=>[...p,matchedProfile]);setActiveChat(matchedProfile);setMessages([]);setSubScreen("chat");}}>
              {isWoman?"Say Hello 👋":"Send a Message"}
            </button>
            <button style={s.btnGhost} onClick={()=>setShowMatch(false)}>Keep Exploring</button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav style={s.nav}>
        {[
          {id:"discover",icon:"⊕",label:"Discover"},
          {id:"matches",icon:isWoman&&pendingApprovals.length>0?"👑":"♡",label:"Connections",badge:isWoman?pendingApprovals.length:0},
          {id:"profile",icon:"◯",label:"Profile"},
        ].map(({id,icon,label,badge})=>{
          const active=tab===id;
          return (
            <button key={id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",color:active?C.ink:C.ink3,padding:"8px 0",position:"relative",transition:"color 0.2s",fontFamily:"inherit"}} onClick={()=>setTab(id)}>
              <span style={{fontSize:22,lineHeight:1}}>{icon}</span>
              <span style={{fontSize:9,fontWeight:active?700:400,letterSpacing:1,textTransform:"uppercase"}}>{label}</span>
              {active && <div style={{width:4,height:4,borderRadius:2,background:C.ink,marginTop:1}}/>}
              {badge>0 && <div style={{position:"absolute",top:4,right:"50%",transform:"translateX(200%)",background:C.accent,color:"white",fontSize:9,fontWeight:700,width:16,height:16,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}>{badge}</div>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

const s = {
  root:{ background:C.bg, minHeight:"100vh", maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column", fontFamily:"'DM Sans', -apple-system, sans-serif", color:C.ink, position:"relative" },
  brandHero:{ fontSize:44, fontWeight:700, color:C.ink, letterSpacing:-1, fontFamily:"'Cormorant Garamond', Georgia, serif" },
  brand:{ fontSize:24, fontWeight:700, color:C.ink, letterSpacing:-0.5, fontFamily:"'Cormorant Garamond', Georgia, serif" },
  hdr:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px 12px", background:"rgba(250,250,248,0.95)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 },
  main:{ flex:1, overflowY:"auto", paddingBottom:72 },
  inp:{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", fontSize:14, color:C.ink, outline:"none", boxSizing:"border-box", fontFamily:"inherit", appearance:"none" },
  btnPrimary:{ width:"100%", background:C.ink, border:"none", borderRadius:14, padding:"15px", color:"white", fontSize:15, fontWeight:600, cursor:"pointer", marginBottom:10, fontFamily:"inherit" },
  btnGhost:{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", color:C.ink2, fontSize:14, cursor:"pointer", marginBottom:10, fontFamily:"inherit" },
  btnGoogle:{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", color:C.ink, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontFamily:"inherit" },
  setupH:{ fontSize:28, fontWeight:700, color:C.ink, lineHeight:1.3 },
  setupSub:{ fontSize:14, color:C.ink2, marginTop:8, lineHeight:1.6 },
  promptBlock:{ background:C.surface, borderRadius:16, padding:"18px 18px 14px", border:`1px solid ${C.border}` },
  likePhotoBtn:{ position:"absolute", bottom:16, right:16, background:"rgba(250,250,248,0.92)", border:"none", borderRadius:22, width:44, height:44, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(8px)" },
  likePromptBtn:{ background:"none", border:"none", fontSize:13, color:C.ink3, cursor:"pointer", marginTop:12, padding:0, fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 },
  profileActions:{ position:"fixed", bottom:72, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, display:"flex", gap:12, padding:"12px 20px", background:"rgba(250,250,248,0.95)", backdropFilter:"blur(12px)", borderTop:`1px solid ${C.border}`, zIndex:10 },
  passBtn:{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"13px", fontSize:14, fontWeight:500, color:C.ink2, cursor:"pointer", fontFamily:"inherit" },
  giftBtnSm:{ width:48, height:48, borderRadius:24, background:C.surface, border:`1px solid ${C.border}`, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  likeBtn:{ flex:1, background:C.ink, border:"none", borderRadius:14, padding:"13px", fontSize:13, fontWeight:600, color:"white", cursor:"pointer", fontFamily:"inherit" },
  pageHdr:{ display:"flex", alignItems:"center", gap:12, padding:"14px 20px", background:"rgba(250,250,248,0.95)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 },
  pageHdrTitle:{ flex:1, fontSize:17, fontWeight:600, color:C.ink, textAlign:"center" },
  backBtn:{ background:"none", border:"none", fontSize:22, color:C.ink, cursor:"pointer", padding:0, width:32, fontFamily:"inherit" },
  msgInp:{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:22, padding:"11px 18px", fontSize:14, outline:"none", color:C.ink, fontFamily:"inherit" },
  sendBtn:{ width:42, height:42, borderRadius:21, background:C.ink, border:"none", color:"white", fontSize:16, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" },
  bubbleMe:{ background:C.ink, color:"white", padding:"11px 16px", borderRadius:"18px 18px 4px 18px", fontSize:14, lineHeight:1.5 },
  bubbleThem:{ background:C.surface, color:C.ink, padding:"11px 16px", borderRadius:"18px 18px 18px 4px", fontSize:14, lineHeight:1.5, border:`1px solid ${C.border}` },
  notif:{ position:"fixed", top:72, left:"50%", transform:"translateX(-50%)", background:C.ink, color:"white", fontSize:13, fontWeight:500, padding:"10px 20px", borderRadius:20, zIndex:100, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(22,12,0,0.2)" },
  nav:{ display:"flex", background:"rgba(250,250,248,0.97)", backdropFilter:"blur(12px)", borderTop:`1px solid ${C.border}`, padding:"6px 0 12px", position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, zIndex:10 },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600;1,700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  button { font-family: inherit; }
  button:active { opacity: 0.85; }
  select, input { -webkit-appearance: none; appearance: none; }
  .fade-up { animation: fadeUp 0.5s cubic-bezier(0.2,0.8,0.2,1) both; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes dot { 0%,80%,100% { opacity:0.3; transform:scale(0.8); } 40% { opacity:1; transform:scale(1); } }
`;
