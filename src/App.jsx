import { useState, useEffect, useRef } from "react";
import { auth, db, rtdb, googleProvider } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { ref, push, onValue, serverTimestamp } from "firebase/database";

// ─── Design tokens (Hinge-inspired) ──────────────────────────────────────────
const C = {
  bg: "#F5F0EB",          // warm off-white
  surface: "#FFFFFF",
  ink: "#1A1108",         // near-black warm
  ink2: "#6B5E52",        // warm mid
  ink3: "#A8998D",        // warm light
  accent: "#C4622D",      // terracotta (Hinge-like)
  accentSoft: "#F0E6DF",  // soft accent bg
  gold: "#B08D57",        // warm gold
  border: "#E8DDD5",
  success: "#2D6A4F",
};

const PROFILES = [
  { id:"p1", name:"Ariana", age:26, city:"Jakarta", job:"Graphic Designer", bio:"Coffee-driven, jazz-addicted, endlessly curious about the world.", interests:["Art","Jazz","Coffee","Travel"], photo:"https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&q=80", verified:true, coins:2450, gifts:47, likedUser:true, matchScore:92, prompt:"The way to my heart is...", promptAnswer:"Through honest conversations over really good coffee." },
  { id:"p2", name:"Rizky", age:29, city:"Bandung", job:"Software Engineer", bio:"I build things by day and play guitar by night. Looking for someone who appreciates both.", interests:["Hiking","Music","Cooking","Tech"], photo:"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80", verified:false, coins:890, gifts:12, likedUser:false, matchScore:78, prompt:"I'm looking for...", promptAnswer:"Someone who can keep up with my terrible music taste." },
  { id:"p3", name:"Cinta", age:24, city:"Jakarta", job:"Photographer", bio:"Life is better through a viewfinder. Let's find something beautiful together.", interests:["Photography","Art","Film","Yoga"], photo:"https://images.unsplash.com/photo-1488716820095-cbe80883c496?w=600&q=80", verified:true, coins:5200, gifts:83, likedUser:true, matchScore:85, prompt:"A non-negotiable for me...", promptAnswer:"Sunday mornings with zero plans and good light." },
  { id:"p4", name:"Dimas", age:31, city:"Bali", job:"Architect", bio:"I design spaces. I surf waves. I cook local food. Sometimes all in one day.", interests:["Architecture","Surfing","Food","Travel"], photo:"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80", verified:true, coins:1780, gifts:29, likedUser:false, matchScore:70, prompt:"My simple pleasures...", promptAnswer:"Cold beer, warm sunset, no agenda." },
  { id:"p5", name:"Maya", age:27, city:"Jakarta", job:"Marketing", bio:"Professional overthinker. Amateur chef. Enthusiastic traveler of the world.", interests:["Travel","Food","Coffee","Music"], photo:"https://images.unsplash.com/photo-1502767882563-62a3523e4e0b?w=600&q=80", verified:true, coins:3100, gifts:61, likedUser:true, matchScore:88, prompt:"I know it's time to go home when...", promptAnswer:"I've started planning my next trip from this one." },
];

const GIFTS = [
  { id:"g1", name:"Rose", icon:"🌹", coins:10 },
  { id:"g2", name:"Coffee", icon:"☕", coins:15 },
  { id:"g3", name:"Wine", icon:"🍷", coins:35 },
  { id:"g4", name:"Ring", icon:"💍", coins:100 },
  { id:"g5", name:"Diamond", icon:"💎", coins:200 },
  { id:"g6", name:"Champagne", icon:"🍾", coins:60 },
];

function matchLabel(score) {
  if(score>=90) return { label:"Exceptional Match", color:C.success };
  if(score>=75) return { label:"Strong Match", color:C.accent };
  if(score>=60) return { label:"Good Match", color:C.gold };
  return { label:"Potential", color:C.ink3 };
}

async function uploadPhoto(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", "nosingle_uploads");
  form.append("folder", "nosingle/profiles");
  const res = await fetch(`https://api.cloudinary.com/v1_1/dvw2c6lp0/image/upload`, { method:"POST", body:form });
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error("Upload failed");
}

export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("splash");
  const [tab, setTab] = useState("discover");
  const [subScreen, setSubScreen] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [form, setForm] = useState({ email:"", password:"", name:"", age:"", city:"Jakarta", bio:"", gender:"" });
  const [authError, setAuthError] = useState("");
  const [setupStep, setSetupStep] = useState(1);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [plan, setPlan] = useState("free");
  const [coins, setCoins] = useState(150);
  const [cardIndex, setCardIndex] = useState(0);
  const [swipeDir, setSwipeDir] = useState(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [likes, setLikes] = useState([]);
  const [showMatch, setShowMatch] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [selectedGiftProfile, setSelectedGiftProfile] = useState(null);
  const [notification, setNotification] = useState(null);
  const [likedPrompt, setLikedPrompt] = useState(null);

  const dragStart = useRef(null);
  const msgEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const timeout = setTimeout(() => { setLoading(false); setScreen("auth"); }, 6000);
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

  useEffect(() => { msgEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

  useEffect(() => {
    if (!activeChat || !user) return;
    const chatId = [user.uid, activeChat.id].sort().join("_");
    const unsub = onValue(ref(rtdb, `chats/${chatId}`), (snap) => {
      const data = snap.val();
      setMessages(data ? Object.values(data).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)) : []);
    });
    return () => unsub();
  }, [activeChat, user]);

  const showNotif = (msg) => { setNotification(msg); setTimeout(()=>setNotification(null), 3000); };

  const current = PROFILES[cardIndex % PROFILES.length];
  const next = PROFILES[(cardIndex+1) % PROFILES.length];
  const ml = current?.matchScore ? matchLabel(current.matchScore) : null;
  const isGold = plan==="gold"||plan==="platinum";
  const planBadge = plan==="platinum"?"💎":plan==="gold"?"✦":null;

  const handleAuth = async () => {
    setAuthError("");
    try {
      if (authMode==="register") await createUserWithEmailAndPassword(auth, form.email, form.password);
      else await signInWithEmailAndPassword(auth, form.email, form.password);
    } catch(e) {
      setAuthError(
        e.code==="auth/user-not-found"||e.code==="auth/wrong-password" ? "Incorrect email or password" :
        e.code==="auth/email-already-in-use" ? "Email already registered" :
        e.code==="auth/weak-password" ? "Password must be at least 6 characters" :
        e.code==="auth/invalid-email" ? "Invalid email format" : "Something went wrong. Try again."
      );
    }
  };

  const handleGoogle = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch(e) { setAuthError("Google sign-in failed."); }
  };

  const handleSetup = async () => {
    if (!form.name||!form.age||!form.city) { setAuthError("Please fill all required fields"); return; }
    if (parseInt(form.age)<18) { setAuthError("You must be 18 or older"); return; }
    setUploading(true);
    let photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name)}&background=C4622D&color=fff&size=200`;
    if (photoFile) { try { photoUrl = await uploadPhoto(photoFile); } catch(e){} }
    const profile = { uid:user.uid, name:form.name, age:parseInt(form.age), city:form.city, bio:form.bio, gender:form.gender, email:user.email, photo:photoUrl, coins:150, gifts:0, verified:false, createdAt:new Date().toISOString() };
    try { await setDoc(doc(db, "users", user.uid), profile); setUserProfile(profile); setScreen("app"); }
    catch(e) { setAuthError("Failed to save profile: "+e.message); }
    setUploading(false);
  };

  const swipe = (dir) => {
    setSwipeDir(dir);
    if (dir==="right") { setLikes(p=>[...p,current.id]); setMatchedProfile(current); setTimeout(()=>setShowMatch(true),350); setTimeout(()=>setShowMatch(false),4000); }
    setTimeout(()=>{ setSwipeDir(null); setDragX(0); setCardIndex(i=>i+1); }, 380);
  };

  const onMD=(e)=>{ dragStart.current=e.clientX||e.touches?.[0]?.clientX; setIsDragging(true); };
  const onMM=(e)=>{ if(!isDragging||dragStart.current===null)return; const x=(e.clientX||e.touches?.[0]?.clientX||0)-dragStart.current; setDragX(x); };
  const onMU=()=>{ if(dragX>80)swipe("right"); else if(dragX<-80)swipe("left"); else setDragX(0); setIsDragging(false); dragStart.current=null; };

  const sendMsg = async () => {
    if (!msgInput.trim()||!activeChat||!user) return;
    const chatId = [user.uid, activeChat.id].sort().join("_");
    const t = new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
    try {
      await push(ref(rtdb,`chats/${chatId}`), { text:msgInput, from:user.uid, time:t, timestamp:serverTimestamp() });
      setMsgInput("");
      const replies=["That's really interesting 😊","Ha, I love that.","Tell me more?","Okay now I need to know the full story 👀","You're funny, I like this."];
      setTimeout(async()=>{
        await push(ref(rtdb,`chats/${chatId}`), { text:replies[Math.floor(Math.random()*replies.length)], from:activeChat.id, time:new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}), timestamp:serverTimestamp() });
      }, 1500);
    } catch(e) { showNotif("Failed to send message"); }
  };

  const sendGift = (gift) => {
    if (!selectedGiftProfile) { showNotif("Select someone first"); return; }
    if (coins<gift.coins) { showNotif("Not enough coins"); return; }
    setCoins(c=>c-gift.coins); showNotif(`${gift.icon} ${gift.name} sent to ${selectedGiftProfile.name}`);
  };

  // ── LOADING ──
  if (loading) return (
    <div style={{...s.root, alignItems:"center", justifyContent:"center", background:C.bg}}>
      <style>{css}</style>
      <div className="fade-in" style={s.brandLarge}>NoSingle</div>
      <div style={{fontSize:14, color:C.ink3, marginTop:8, letterSpacing:2, textTransform:"uppercase"}}>Find your person</div>
      <div style={{display:"flex", gap:6, marginTop:32}}>
        {[0,1,2].map(i=><div key={i} style={{width:6, height:6, borderRadius:"50%", background:C.accent, animation:"pulse 1.2s infinite", animationDelay:`${i*0.3}s`}}/>)}
      </div>
    </div>
  );

  // ── AUTH ──
  if (screen==="auth") return (
    <div style={{...s.root, background:C.bg}}>
      <style>{css}</style>
      <div style={{flex:1, display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"60px 28px 48px"}}>
        <div className="fade-in">
          <div style={s.brandLarge}>NoSingle</div>
          <div style={{fontSize:15, color:C.ink2, marginTop:8, lineHeight:1.6}}>Designed to be deleted.<br/>Until then, let's find someone worth keeping.</div>
        </div>
        <div className="slide-up" style={{display:"flex", flexDirection:"column", gap:0}}>
          <div style={s.tabsWrap}>
            {["login","register"].map(m=>(
              <button key={m} style={{...s.tabBtn,...(authMode===m?s.tabBtnActive:{})}} onClick={()=>{setAuthMode(m);setAuthError("");}}>
                {m==="login"?"Sign In":"Create Account"}
              </button>
            ))}
          </div>
          <div style={s.formCard}>
            <input type="email" placeholder="Email address" style={s.inp} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
            <input type="password" placeholder="Password" style={{...s.inp, marginBottom:0}} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/>
            {authError && <div style={s.errMsg}>{authError}</div>}
            <button style={s.primaryBtn} onClick={handleAuth}>{authMode==="login"?"Sign In":"Create Account"}</button>
            <div style={{display:"flex", alignItems:"center", gap:12, margin:"4px 0"}}>
              <div style={{flex:1, height:1, background:C.border}}/>
              <span style={{fontSize:12, color:C.ink3}}>or</span>
              <div style={{flex:1, height:1, background:C.border}}/>
            </div>
            <button style={s.googleBtn} onClick={handleGoogle}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── SETUP ──
  if (screen==="setup") return (
    <div style={{...s.root, background:C.bg}}>
      <style>{css}</style>
      <div style={{padding:"48px 28px 100px"}}>
        <div style={{display:"flex", gap:4, marginBottom:32}}>
          {[1,2,3].map(i=><div key={i} style={{flex:1, height:2, borderRadius:1, background:i<=setupStep?C.accent:C.border, transition:"background 0.3s"}}/>)}
        </div>
        {setupStep===1 && (
          <div className="fade-in">
            <div style={s.setupTitle}>Add your photo</div>
            <div style={s.setupSubtitle}>Profiles with photos get significantly more connections.</div>
            <div style={{display:"flex", justifyContent:"center", margin:"32px 0"}}>
              <div style={{width:160, height:160, borderRadius:80, border:`2px dashed ${C.border}`, cursor:"pointer", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", background:C.surface}} onClick={()=>fileInputRef.current?.click()}>
                {photoPreview?<img src={photoPreview} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<div style={{textAlign:"center"}}><div style={{fontSize:32}}>+</div><div style={{fontSize:12,color:C.ink3,marginTop:4}}>Add photo</div></div>}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);const r=new FileReader();r.onload=ev=>setPhotoPreview(ev.target.result);r.readAsDataURL(f);}}}/>
            </div>
            <button style={s.primaryBtn} onClick={()=>setSetupStep(2)}>Continue</button>
            <button style={s.ghostBtn} onClick={()=>setSetupStep(2)}>Skip for now</button>
          </div>
        )}
        {setupStep===2 && (
          <div className="fade-in">
            <div style={s.setupTitle}>Tell us about you</div>
            <div style={s.setupSubtitle}>This is what others will see on your profile.</div>
            <div style={{marginTop:24, display:"flex", flexDirection:"column", gap:12}}>
              <input placeholder="First name *" style={s.inp} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
              <input type="number" placeholder="Age *" style={s.inp} value={form.age} min="18" onChange={e=>setForm(p=>({...p,age:e.target.value}))}/>
              <input placeholder="A short bio..." style={{...s.inp, marginBottom:0}} value={form.bio} onChange={e=>setForm(p=>({...p,bio:e.target.value}))}/>
              <select style={s.inp} value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}>
                <option value="">Gender *</option>
                <option value="male">Man</option>
                <option value="female">Woman</option>
                <option value="nonbinary">Non-binary</option>
                <option value="other">Other</option>
              </select>
              <select style={{...s.inp, marginBottom:0}} value={form.city} onChange={e=>setForm(p=>({...p,city:e.target.value}))}>
                {["Jakarta","Bandung","Surabaya","Bali","Yogyakarta","Medan","Singapore","Kuala Lumpur","Sydney","Melbourne","Tokyo","Seoul","Dubai","London","New York"].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {authError && <div style={{...s.errMsg, marginTop:12}}>{authError}</div>}
            <div style={{display:"flex", gap:12, marginTop:24}}>
              <button style={{...s.ghostBtn, flex:1, marginBottom:0}} onClick={()=>setSetupStep(1)}>Back</button>
              <button style={{...s.primaryBtn, flex:2, marginBottom:0}} onClick={()=>{if(!form.name||!form.age){setAuthError("Name and age are required");return;}setSetupStep(3);}}>Continue</button>
            </div>
          </div>
        )}
        {setupStep===3 && (
          <div className="fade-in">
            <div style={s.setupTitle}>You're all set</div>
            <div style={s.setupSubtitle}>Here's how your profile will look to others.</div>
            <div style={{background:C.surface, borderRadius:20, overflow:"hidden", marginTop:24, boxShadow:`0 4px 24px rgba(26,17,8,0.08)`}}>
              <div style={{height:200, overflow:"hidden"}}>
                <img src={photoPreview||`https://ui-avatars.com/api/?name=${form.name}&background=C4622D&color=fff&size=400`} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
              </div>
              <div style={{padding:20}}>
                <div style={{fontSize:22, fontWeight:700, color:C.ink}}>{form.name}, {form.age}</div>
                <div style={{fontSize:14, color:C.ink2, marginTop:4}}>{form.city}</div>
                {form.bio && <div style={{fontSize:14, color:C.ink, marginTop:12, lineHeight:1.6}}>{form.bio}</div>}
              </div>
            </div>
            {authError && <div style={{...s.errMsg, marginTop:12}}>{authError}</div>}
            <button style={{...s.primaryBtn, marginTop:24}} onClick={handleSetup} disabled={uploading}>
              {uploading?"Saving your profile...":"Start Exploring"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── CHAT ──
  if (subScreen==="chat" && activeChat) return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={s.chatHeader}>
        <button style={s.iconBtn} onClick={()=>setSubScreen(null)}>←</button>
        <div style={{flex:1, display:"flex", alignItems:"center", gap:10}}>
          <img src={activeChat.photo} style={{width:38, height:38, borderRadius:19, objectFit:"cover"}} alt=""/>
          <div>
            <div style={{fontSize:15, fontWeight:600, color:C.ink}}>{activeChat.name}</div>
            <div style={{fontSize:12, color:C.ink3}}>Active now</div>
          </div>
        </div>
        <button style={s.iconBtn} onClick={()=>{setSelectedGiftProfile(activeChat);setSubScreen("gift");}}>🎁</button>
      </div>
      <div style={{flex:1, overflowY:"auto", padding:"16px 20px 8px", display:"flex", flexDirection:"column", gap:12}}>
        {messages.length===0 && (
          <div style={{textAlign:"center", padding:"48px 24px"}}>
            <div style={{fontSize:13, color:C.ink3, lineHeight:1.6}}>You matched with <strong style={{color:C.ink}}>{activeChat.name}</strong>.<br/>Say something genuine.</div>
          </div>
        )}
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex", flexDirection:"column", maxWidth:"75%", alignSelf:m.from===user?.uid?"flex-end":"flex-start", alignItems:m.from===user?.uid?"flex-end":"flex-start"}}>
            <div style={m.from===user?.uid?s.bubbleMe:s.bubbleThem}>{m.text}</div>
            <div style={{fontSize:10, color:C.ink3, marginTop:4}}>{m.time}</div>
          </div>
        ))}
        <div ref={msgEndRef}/>
      </div>
      <div style={s.chatInput}>
        <input style={s.msgInp} placeholder="Write something..." value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()}/>
        <button style={s.sendBtn} onClick={sendMsg}>↑</button>
      </div>
    </div>
  );

  // ── GIFT ──
  if (subScreen==="gift") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={s.pageHeader}>
        <button style={s.iconBtn} onClick={()=>setSubScreen(null)}>←</button>
        <div style={s.pageTitle}>Send a Gift</div>
        <div style={{fontSize:13, fontWeight:600, color:C.gold}}>✦ {coins}</div>
      </div>
      <div style={{flex:1, overflowY:"auto", padding:"16px 20px"}}>
        <div style={{fontSize:12, color:C.ink3, letterSpacing:1, textTransform:"uppercase", marginBottom:12}}>Send to</div>
        <div style={{display:"flex", gap:12, marginBottom:24, overflowX:"auto", paddingBottom:4}}>
          {PROFILES.map(p=>(
            <div key={p.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}} onClick={()=>setSelectedGiftProfile(p)}>
              <div style={{padding:2, borderRadius:28, border:`2px solid ${selectedGiftProfile?.id===p.id?C.accent:"transparent"}`, transition:"border 0.2s"}}>
                <img src={p.photo} style={{width:52,height:52,borderRadius:24,objectFit:"cover",display:"block"}} alt={p.name}/>
              </div>
              <span style={{fontSize:11, fontWeight:selectedGiftProfile?.id===p.id?600:400, color:selectedGiftProfile?.id===p.id?C.accent:C.ink2}}>{p.name}</span>
            </div>
          ))}
        </div>
        <div style={{fontSize:12, color:C.ink3, letterSpacing:1, textTransform:"uppercase", marginBottom:12}}>Choose a gift</div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10}}>
          {GIFTS.map(g=>(
            <div key={g.id} style={{background:C.surface, borderRadius:16, padding:"16px 8px", textAlign:"center", cursor:"pointer", border:`1px solid ${C.border}`}} onClick={()=>sendGift(g)}>
              <div style={{fontSize:28, marginBottom:6}}>{g.icon}</div>
              <div style={{fontSize:12, fontWeight:600, color:C.ink, marginBottom:2}}>{g.name}</div>
              <div style={{fontSize:11, color:C.gold}}>✦ {g.coins}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── PREMIUM ──
  if (subScreen==="premium") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif}>{notification}</div>}
      <div style={s.pageHeader}>
        <button style={s.iconBtn} onClick={()=>setSubScreen(null)}>←</button>
        <div style={s.pageTitle}>Membership</div>
        <div style={{width:32}}/>
      </div>
      <div style={{flex:1, overflowY:"auto", padding:"16px 20px 40px"}}>
        <div style={{background:`linear-gradient(135deg, #1A1108, #3D2B1A)`, borderRadius:20, padding:24, marginBottom:20, color:"white"}}>
          <div style={{fontSize:11, letterSpacing:2, textTransform:"uppercase", color:"rgba(255,255,255,0.5)", marginBottom:8}}>NoSingle</div>
          <div style={{fontSize:28, fontWeight:700, marginBottom:4}}>Find better,<br/>faster.</div>
          <div style={{fontSize:14, color:"rgba(255,255,255,0.65)", lineHeight:1.6}}>Unlock every feature. Meet people who actually match your life.</div>
        </div>
        {[
          {id:"gold", name:"Gold", badge:"✦", price:"$5.99", period:"per month", color:"#B08D57", features:["See who likes you","5 Super Likes daily","Undo last swipe","Gold badge on profile","No advertisements"]},
          {id:"platinum", name:"Platinum", badge:"◆", price:"$9.99", period:"per month", color:C.ink, popular:true, features:["Everything in Gold","Unlimited Super Likes","In-app video & voice calls","Read receipts","Priority in discovery","Platinum badge"]},
        ].map(p=>(
          <div key={p.id} style={{background:C.surface, borderRadius:20, padding:20, marginBottom:12, border:`1.5px solid ${p.popular?C.ink:C.border}`, position:"relative"}}>
            {p.popular && <div style={{position:"absolute", top:-10, left:20, background:C.ink, color:"white", fontSize:10, fontWeight:600, letterSpacing:1, textTransform:"uppercase", padding:"3px 12px", borderRadius:20}}>Most Popular</div>}
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16}}>
              <div>
                <div style={{fontSize:18, fontWeight:700, color:p.color}}>{p.badge} {p.name}</div>
                <div style={{fontSize:24, fontWeight:700, color:C.ink, marginTop:4}}>{p.price} <span style={{fontSize:13, fontWeight:400, color:C.ink3}}>{p.period}</span></div>
              </div>
              <button style={{background:p.popular?C.ink:C.surface, border:`1.5px solid ${p.popular?C.ink:C.ink}`, borderRadius:12, padding:"10px 20px", color:p.popular?"white":C.ink, fontSize:13, fontWeight:600, cursor:"pointer"}}
                onClick={()=>{setPlan(p.id);setSubScreen(null);showNotif(`${p.badge} ${p.name} activated`);}}>
                Select
              </button>
            </div>
            {p.features.map(f=>(
              <div key={f} style={{display:"flex", gap:10, padding:"5px 0", fontSize:13, color:C.ink2}}>
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

      <header style={s.header}>
        <div style={s.brand}>NoSingle</div>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          {planBadge && <span style={{fontSize:13, color:C.gold, fontWeight:600}}>{planBadge}</span>}
          <div style={{fontSize:13, fontWeight:600, color:C.gold, cursor:"pointer"}}>✦ {coins}</div>
          <img src={userProfile?.photo||`https://ui-avatars.com/api/?name=${userProfile?.name||"U"}&background=C4622D&color=fff`} style={{width:34, height:34, borderRadius:17, objectFit:"cover", cursor:"pointer", border:`1.5px solid ${C.border}`}} alt="me" onClick={()=>setTab("profile")}/>
        </div>
      </header>

      <main style={s.main}>

        {/* ── DISCOVER ── */}
        {tab==="discover" && current && (
          <div style={{padding:"16px 20px 0", display:"flex", flexDirection:"column", alignItems:"center"}}>
            <div style={{width:"100%", display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16}}>
              <div>
                <div style={{fontSize:22, fontWeight:700, color:C.ink}}>Hello, {userProfile?.name?.split(" ")[0]} 👋</div>
                <div style={{fontSize:13, color:C.ink2, marginTop:2}}>Here's who's nearby</div>
              </div>
              <button style={{background:"none", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"6px 14px", fontSize:12, fontWeight:600, color:C.ink, cursor:"pointer"}} onClick={()=>setSubScreen("premium")}>
                {plan==="free"?"Upgrade":"✦ "+plan}
              </button>
            </div>

            {/* Card stack */}
            <div style={{position:"relative", width:"100%", maxWidth:380, height:520, marginBottom:12}}>
              {/* Back card */}
              <div style={{...s.card, transform:"scale(0.94) translateY(16px)", zIndex:0, filter:"brightness(0.9)"}}>
                <img src={next.photo} style={s.cardImg} alt="" draggable={false}/>
              </div>

              {/* Front card */}
              <div className={swipeDir==="right"?"fly-right":swipeDir==="left"?"fly-left":""}
                style={{...s.card, transform:`translateX(${dragX}px) rotate(${dragX*0.035}deg)`, transition:isDragging?"none":"transform 0.2s ease", cursor:isDragging?"grabbing":"grab", zIndex:2}}
                onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}
                onTouchStart={onMD} onTouchMove={onMM} onTouchEnd={onMU}>

                {/* Photo */}
                <img src={current.photo} style={s.cardImg} alt={current.name} draggable={false}/>

                {/* Swipe indicators */}
                {dragX>50 && <div style={{...s.swipeTag, left:20, color:C.success, borderColor:C.success, background:"rgba(255,255,255,0.95)", opacity:Math.min(dragX/90,1)}}>Like</div>}
                {dragX<-50 && <div style={{...s.swipeTag, right:20, color:"#C13B2A", borderColor:"#C13B2A", background:"rgba(255,255,255,0.95)", opacity:Math.min(-dragX/90,1)}}>Pass</div>}

                {/* Match score pill */}
                <div style={s.matchPill}>
                  <span style={{color:ml?.color, fontWeight:700, fontSize:12}}>{current.matchScore}%</span>
                  <span style={{fontSize:11, color:C.ink2, marginLeft:4}}>{ml?.label}</span>
                </div>

                {/* Card content overlay */}
                <div style={s.cardOverlay}>
                  <div style={{display:"flex", alignItems:"flex-end", gap:8, marginBottom:4}}>
                    <div style={{fontSize:26, fontWeight:700, color:"white"}}>{current.name}</div>
                    <div style={{fontSize:18, color:"rgba(255,255,255,0.8)", marginBottom:2}}>{current.age}</div>
                    {current.verified && <div style={{marginBottom:2, fontSize:12, color:"white", background:"rgba(255,255,255,0.25)", borderRadius:8, padding:"2px 8px"}}>✓</div>}
                  </div>
                  <div style={{fontSize:13, color:"rgba(255,255,255,0.7)", marginBottom:10}}>{current.job} · {current.city}</div>

                  {/* Prompt */}
                  <div style={s.promptCard}>
                    <div style={{fontSize:11, color:C.ink3, marginBottom:4, fontStyle:"italic"}}>{current.prompt}</div>
                    <div style={{fontSize:13, color:C.ink, lineHeight:1.5}}>{current.promptAnswer}</div>
                    <button style={s.heartPromptBtn} onClick={(e)=>{e.stopPropagation();setLikedPrompt(current.id);showNotif(`You liked ${current.name}'s answer ❤️`);}}>
                      {likedPrompt===current.id?"❤️":"🤍"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{display:"flex", alignItems:"center", gap:16, padding:"4px 0 16px"}}>
              <button style={s.actionBtnSecondary} onClick={()=>swipe("left")}>✕</button>
              <button style={s.actionBtnGift} onClick={()=>{setSelectedGiftProfile(current);setSubScreen("gift");}}>🎁</button>
              <button style={s.actionBtnPrimary} onClick={()=>swipe("right")}>♥</button>
            </div>
          </div>
        )}

        {/* ── MATCHES ── */}
        {tab==="matches" && (
          <div style={{padding:"20px"}}>
            <div style={{fontSize:22, fontWeight:700, color:C.ink, marginBottom:4}}>Connections</div>
            <div style={{fontSize:13, color:C.ink2, marginBottom:20}}>People you've connected with</div>

            {/* Who liked you */}
            <div style={{background:C.surface, borderRadius:16, padding:16, marginBottom:16, border:`1px solid ${C.border}`}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                <div style={{fontSize:14, fontWeight:600, color:C.ink}}>Likes You</div>
                {!isGold && <button style={{fontSize:12, fontWeight:600, color:C.accent, background:"none", border:"none", cursor:"pointer"}} onClick={()=>setSubScreen("premium")}>Unlock ✦</button>}
              </div>
              <div style={{display:"flex", gap:8}}>
                {PROFILES.filter(p=>p.likedUser).map((p,i)=>(
                  <div key={p.id} style={{position:"relative"}}>
                    <img src={p.photo} style={{width:56, height:56, borderRadius:28, objectFit:"cover", filter:isGold?"none":"blur(10px)"}} alt=""/>
                    {!isGold && i===0 && <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18}}>🔒</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Profile list */}
            {PROFILES.map(p=>(
              <div key={p.id} style={{display:"flex", alignItems:"center", gap:14, padding:"14px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer"}}
                onClick={()=>{setActiveChat(p);setMessages([]);setSubScreen("chat");}}>
                <img src={p.photo} style={{width:58, height:58, borderRadius:29, objectFit:"cover", flexShrink:0}} alt={p.name}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex", alignItems:"center", gap:6}}>
                    <span style={{fontSize:16, fontWeight:600, color:C.ink}}>{p.name}, {p.age}</span>
                    {p.verified && <span style={{fontSize:11, color:C.success}}>✓</span>}
                  </div>
                  <div style={{fontSize:12, color:C.ink3, marginTop:2}}>{p.city}</div>
                  <div style={{fontSize:12, color:ml?.color||C.accent, marginTop:2, fontWeight:500}}>{p.matchScore}% match</div>
                </div>
                <span style={{fontSize:20, color:C.border}}>›</span>
              </div>
            ))}
          </div>
        )}

        {/* ── SHOP ── */}
        {tab==="shop" && (
          <div style={{padding:"20px"}}>
            <div style={{fontSize:22, fontWeight:700, color:C.ink, marginBottom:4}}>Gift Shop</div>
            <div style={{fontSize:13, color:C.ink2, marginBottom:20}}>Send something meaningful</div>
            <div style={{background:C.surface, borderRadius:16, padding:16, display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, border:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontSize:13, color:C.ink3}}>Your balance</div>
                <div style={{fontSize:24, fontWeight:700, color:C.gold}}>✦ {coins}</div>
              </div>
              <button style={{...s.primaryBtn, width:"auto", padding:"10px 20px", marginBottom:0, fontSize:13}} onClick={()=>showNotif("Coming soon!")}>Top up</button>
            </div>
            <div style={{fontSize:12, color:C.ink3, letterSpacing:1, textTransform:"uppercase", marginBottom:12}}>Send to</div>
            <div style={{display:"flex", gap:12, marginBottom:20, overflowX:"auto", paddingBottom:4}}>
              {PROFILES.map(p=>(
                <div key={p.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}} onClick={()=>setSelectedGiftProfile(p)}>
                  <div style={{padding:2, borderRadius:28, border:`2px solid ${selectedGiftProfile?.id===p.id?C.accent:"transparent"}`, transition:"border 0.2s"}}>
                    <img src={p.photo} style={{width:52,height:52,borderRadius:24,objectFit:"cover",display:"block"}} alt={p.name}/>
                  </div>
                  <span style={{fontSize:11, color:selectedGiftProfile?.id===p.id?C.accent:C.ink2, fontWeight:selectedGiftProfile?.id===p.id?600:400}}>{p.name}</span>
                </div>
              ))}
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10}}>
              {GIFTS.map(g=>(
                <div key={g.id} style={{background:C.surface, borderRadius:16, padding:"16px 8px", textAlign:"center", cursor:"pointer", border:`1px solid ${C.border}`}} onClick={()=>sendGift(g)}>
                  <div style={{fontSize:28, marginBottom:6}}>{g.icon}</div>
                  <div style={{fontSize:12, fontWeight:600, color:C.ink, marginBottom:2}}>{g.name}</div>
                  <div style={{fontSize:11, color:C.gold}}>✦ {g.coins}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PROFILE ── */}
        {tab==="profile" && (
          <div style={{paddingBottom:80}}>
            {/* Hero */}
            <div style={{position:"relative", height:280}}>
              <img src={userProfile?.photo||`https://ui-avatars.com/api/?name=${userProfile?.name||"U"}&background=C4622D&color=fff&size=400`} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="me"/>
              <div style={{position:"absolute", inset:0, background:"linear-gradient(to top, rgba(26,17,8,0.85) 0%, transparent 60%)"}}/>
              <div style={{position:"absolute", bottom:0, left:0, right:0, padding:"20px 24px"}}>
                <div style={{fontSize:26, fontWeight:700, color:"white"}}>{userProfile?.name}, {userProfile?.age}</div>
                <div style={{fontSize:14, color:"rgba(255,255,255,0.7)", marginTop:2}}>{userProfile?.city}</div>
              </div>
            </div>

            <div style={{padding:"20px 24px"}}>
              {/* Stats */}
              <div style={{display:"flex", gap:0, background:C.surface, borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}`, marginBottom:20}}>
                {[[likes.length,"Likes"],[coins,"Coins"],[plan==="free"?"Free":plan,"Plan"]].map(([n,l],i)=>(
                  <div key={l} style={{flex:1, padding:"16px 8px", textAlign:"center", borderRight:i<2?`1px solid ${C.border}`:"none"}}>
                    <div style={{fontSize:18, fontWeight:700, color:C.ink}}>{n}</div>
                    <div style={{fontSize:11, color:C.ink3, marginTop:2, textTransform:"uppercase", letterSpacing:0.5}}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Menu */}
              {[
                ["Membership", plan==="free"?"Upgrade your experience":"Active: "+plan, ()=>setSubScreen("premium")],
                ["Gift Shop", "Send gifts to connections", ()=>setSubScreen("gift")],
                ["Edit Profile", "Update your photos and bio", ()=>showNotif("Coming soon!")],
                ["Privacy", "Manage your data", ()=>showNotif("Coming soon!")],
              ].map(([label,sub,action])=>(
                <div key={label} style={{display:"flex", alignItems:"center", padding:"16px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer"}} onClick={action}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15, fontWeight:600, color:C.ink}}>{label}</div>
                    <div style={{fontSize:12, color:C.ink3, marginTop:2}}>{sub}</div>
                  </div>
                  <span style={{fontSize:18, color:C.border}}>›</span>
                </div>
              ))}

              <button style={{...s.ghostBtn, marginTop:24, color:"#C13B2A", borderColor:"#C13B2A"}} onClick={()=>signOut(auth)}>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Match popup */}
      {showMatch && matchedProfile && (
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(26,17,8,0.7)",backdropFilter:"blur(16px)",padding:20}} className="fade-in">
          <div style={{background:C.surface, borderRadius:"24px 24px 20px 20px", width:"100%", maxWidth:430, padding:"32px 24px 40px", textAlign:"center"}}>
            <div style={{display:"flex", justifyContent:"center", gap:-16, marginBottom:20}}>
              <img src={userProfile?.photo||""} style={{width:72,height:72,borderRadius:36,objectFit:"cover",border:`3px solid ${C.surface}`,zIndex:2}} alt="me"/>
              <img src={matchedProfile.photo} style={{width:72,height:72,borderRadius:36,objectFit:"cover",border:`3px solid ${C.surface}`,marginLeft:-16}} alt="match"/>
            </div>
            <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:C.ink3,marginBottom:8}}>It's a Match</div>
            <div style={{fontSize:24,fontWeight:700,color:C.ink,marginBottom:8}}>You and {matchedProfile.name}</div>
            <div style={{fontSize:14,color:C.ink2,marginBottom:28,lineHeight:1.6}}>You both liked each other. Don't keep them waiting.</div>
            <button style={s.primaryBtn} onClick={()=>{setShowMatch(false);setActiveChat(matchedProfile);setMessages([]);setSubScreen("chat");}}>
              Send a Message
            </button>
            <button style={{...s.ghostBtn, marginBottom:0}} onClick={()=>setShowMatch(false)}>
              Keep Exploring
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav style={s.bottomNav}>
        {[{id:"discover",icon:"⊕",label:"Discover"},{id:"matches",icon:"♡",label:"Matches"},{id:"shop",icon:"✦",label:"Gifts"},{id:"profile",icon:"◯",label:"Profile"}].map(({id,icon,label})=>{
          const active=tab===id;
          return (
            <button key={id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",color:active?C.accent:C.ink3,padding:"8px 0"}} onClick={()=>setTab(id)}>
              <span style={{fontSize:20,lineHeight:1}}>{icon}</span>
              <span style={{fontSize:9,fontWeight:active?700:400,letterSpacing:0.5,textTransform:"uppercase"}}>{label}</span>
              {active && <div style={{width:4,height:4,borderRadius:2,background:C.accent}}/>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

const s = {
  root:{ background:C.bg, minHeight:"100vh", maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column", fontFamily:"'Cormorant Garamond', 'Georgia', serif", color:C.ink, position:"relative" },
  brandLarge:{ fontSize:42, fontWeight:700, color:C.ink, letterSpacing:-1, fontFamily:"'Cormorant Garamond', Georgia, serif" },
  brand:{ fontSize:22, fontWeight:700, color:C.ink, letterSpacing:-0.5, fontFamily:"'Cormorant Garamond', Georgia, serif" },
  header:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px 12px", background:"rgba(245,240,235,0.92)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 },
  main:{ flex:1, overflowY:"auto", paddingBottom:70 },
  tabsWrap:{ display:"flex", background:C.bg, borderRadius:"16px 16px 0 0", padding:"4px 4px 0", gap:4 },
  tabBtn:{ flex:1, padding:"12px 8px", border:"none", background:"none", borderRadius:"12px 12px 0 0", cursor:"pointer", fontSize:14, fontWeight:500, color:C.ink3, fontFamily:"inherit" },
  tabBtnActive:{ background:C.surface, color:C.ink, fontWeight:600 },
  formCard:{ background:C.surface, borderRadius:"0 0 20px 20px", padding:"20px 20px 24px", display:"flex", flexDirection:"column", gap:0, boxShadow:`0 8px 32px rgba(26,17,8,0.08)` },
  inp:{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", fontSize:14, color:C.ink, outline:"none", marginBottom:12, boxSizing:"border-box", fontFamily:"inherit" },
  errMsg:{ fontSize:13, color:"#C13B2A", padding:"8px 0 4px", textAlign:"center" },
  primaryBtn:{ width:"100%", background:C.ink, border:"none", borderRadius:14, padding:"15px", color:"white", fontSize:15, fontWeight:600, cursor:"pointer", marginBottom:10, fontFamily:"inherit", letterSpacing:0.3 },
  ghostBtn:{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", color:C.ink2, fontSize:14, fontWeight:500, cursor:"pointer", marginBottom:10, fontFamily:"inherit" },
  googleBtn:{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", color:C.ink, fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontFamily:"inherit" },
  setupTitle:{ fontSize:28, fontWeight:700, color:C.ink, lineHeight:1.3, fontFamily:"'Cormorant Garamond', Georgia, serif" },
  setupSubtitle:{ fontSize:14, color:C.ink2, marginTop:8, lineHeight:1.6 },
  card:{ position:"absolute", inset:0, borderRadius:24, overflow:"hidden", background:C.surface, boxShadow:`0 8px 40px rgba(26,17,8,0.15)` },
  cardImg:{ width:"100%", height:"100%", objectFit:"cover", display:"block", pointerEvents:"none", userSelect:"none" },
  cardOverlay:{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(to top, rgba(26,17,8,0.92) 0%, rgba(26,17,8,0.4) 50%, transparent 100%)", padding:"20px 20px 16px" },
  matchPill:{ position:"absolute", top:16, left:"50%", transform:"translateX(-50%)", background:"rgba(245,240,235,0.95)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", fontSize:12, whiteSpace:"nowrap", zIndex:3, boxShadow:"0 2px 12px rgba(26,17,8,0.1)" },
  swipeTag:{ position:"absolute", top:24, padding:"6px 16px", borderRadius:10, fontSize:13, fontWeight:700, border:"2px solid", zIndex:5, letterSpacing:1, textTransform:"uppercase" },
  promptCard:{ background:"rgba(245,240,235,0.92)", borderRadius:14, padding:"12px 14px", position:"relative" },
  heartPromptBtn:{ position:"absolute", top:10, right:12, background:"none", border:"none", cursor:"pointer", fontSize:18, padding:0 },
  actionBtnPrimary:{ width:64, height:64, borderRadius:32, background:C.ink, border:"none", color:"white", fontSize:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 4px 20px rgba(26,17,8,0.25)` },
  actionBtnSecondary:{ width:54, height:54, borderRadius:27, background:C.surface, border:`1.5px solid ${C.border}`, color:C.ink, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" },
  actionBtnGift:{ width:46, height:46, borderRadius:23, background:C.accentSoft, border:"none", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" },
  pageHeader:{ display:"flex", alignItems:"center", gap:12, padding:"14px 20px", background:"rgba(245,240,235,0.95)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 },
  pageTitle:{ flex:1, fontSize:17, fontWeight:600, color:C.ink, textAlign:"center" },
  iconBtn:{ background:"none", border:"none", fontSize:20, color:C.ink, cursor:"pointer", padding:0, width:32, fontFamily:"inherit" },
  chatHeader:{ display:"flex", alignItems:"center", gap:12, padding:"12px 20px", background:"rgba(245,240,235,0.95)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:10 },
  chatInput:{ display:"flex", gap:10, padding:"10px 20px 16px", background:C.surface, borderTop:`1px solid ${C.border}`, alignItems:"center" },
  msgInp:{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:22, padding:"11px 18px", fontSize:14, outline:"none", color:C.ink, fontFamily:"inherit" },
  sendBtn:{ width:42, height:42, borderRadius:21, background:C.ink, border:"none", color:"white", fontSize:16, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" },
  bubbleMe:{ background:C.ink, color:"white", padding:"11px 16px", borderRadius:"18px 18px 4px 18px", fontSize:14, lineHeight:1.5 },
  bubbleThem:{ background:C.surface, color:C.ink, padding:"11px 16px", borderRadius:"18px 18px 18px 4px", fontSize:14, lineHeight:1.5, border:`1px solid ${C.border}` },
  notif:{ position:"fixed", top:72, left:"50%", transform:"translateX(-50%)", background:C.ink, color:"white", fontSize:13, fontWeight:500, padding:"10px 20px", borderRadius:20, zIndex:100, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(26,17,8,0.2)" },
  bottomNav:{ display:"flex", background:"rgba(245,240,235,0.95)", backdropFilter:"blur(12px)", borderTop:`1px solid ${C.border}`, padding:"6px 0 10px", position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, zIndex:10 },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  button { font-family: inherit; }
  button:active { opacity: 0.8; transform: scale(0.98); }
  select { appearance: none; cursor: pointer; }
  .fade-in { animation: fadeIn 0.5s ease both; }
  .slide-up { animation: slideUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .fly-right { animation: flyRight 0.4s cubic-bezier(0.4, 0, 1, 1) forwards; }
  .fly-left { animation: flyLeft 0.4s cubic-bezier(0.4, 0, 1, 1) forwards; }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes slideUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes flyRight { to { transform:translateX(120%) rotate(20deg); opacity:0; } }
  @keyframes flyLeft { to { transform:translateX(-120%) rotate(-20deg); opacity:0; } }
  @keyframes pulse { 0%,100% { opacity:0.4; transform:scale(0.8); } 50% { opacity:1; transform:scale(1); } }
`;
