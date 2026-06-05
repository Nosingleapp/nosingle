import { useState, useEffect, useRef, useMemo } from "react";
import { auth, db, rtdb, googleProvider } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion
} from "firebase/firestore";
import { ref, push, onValue, serverTimestamp } from "firebase/database";

// ─── Constants ────────────────────────────────────────────────────────────────
const CORAL = "#E8735A", ROSE = "#D4879C", SOFT_BG = "#FDF8F5", TEXT = "#2D1F1A", TEXT2 = "#8A7070";
const PAYPAL_CLIENT_ID = "AW12vxJZHLN32i5GlcksC1_IC1jFZL3Svteb08_Vos_og4dRwipJ7ftqPJdS2G3rCxXWArsFx0xelJnc";
const CLOUDINARY_CLOUD = "dvw2c6lp0";
const CLOUDINARY_PRESET = "nosingle_uploads";

// ─── Profiles ─────────────────────────────────────────────────────────────────
const PROFILES = [
  { id:"p1", name:"Ariana", age:26, city:"Jakarta", job:"Graphic Designer", bio:"Coffee addict & jazz lover ☕", interests:["Art","Jazz","Coffee","Travel"], lifestyle:["Extrovert","Foodie"], photo:"https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=500&q=80", gender:"female", verified:true, coins:2450, gifts:47, likedUser:true },
  { id:"p2", name:"Rizky", age:29, city:"Bandung", job:"Software Engineer", bio:"Guitar, hiking & cooking 🎸", interests:["Hiking","Music","Cooking","Tech"], lifestyle:["Homebody","Early Bird"], photo:"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&q=80", gender:"male", verified:false, coins:890, gifts:12, likedUser:false },
  { id:"p3", name:"Cinta", age:24, city:"Jakarta", job:"Photographer", bio:"Life through a lens 📷", interests:["Photography","Art","Film","Yoga"], lifestyle:["Extrovert","Adventurer"], photo:"https://images.unsplash.com/photo-1488716820095-cbe80883c496?w=500&q=80", gender:"female", verified:true, coins:5200, gifts:83, likedUser:true },
  { id:"p4", name:"Dimas", age:31, city:"Bali", job:"Architect", bio:"Design, surf, local food 🏄", interests:["Architecture","Surfing","Food","Travel"], lifestyle:["Adventurer","Extrovert"], photo:"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&q=80", gender:"male", verified:true, coins:1780, gifts:29, likedUser:false },
  { id:"p5", name:"Maya", age:27, city:"Jakarta", job:"Marketing", bio:"Travel & food explorer 🌏", interests:["Travel","Food","Coffee","Music"], lifestyle:["Extrovert","Adventurer"], photo:"https://images.unsplash.com/photo-1502767882563-62a3523e4e0b?w=500&q=80", gender:"female", verified:true, coins:3100, gifts:61, likedUser:true },
];

const GIFTS = [
  { id:"g1", name:"Rose", icon:"🌹", coins:10, price:0.99 },
  { id:"g2", name:"Coffee", icon:"☕", coins:15, price:1.29 },
  { id:"g3", name:"Beer", icon:"🍺", coins:20, price:1.99 },
  { id:"g4", name:"Wine", icon:"🍷", coins:35, price:2.99 },
  { id:"g5", name:"Ring", icon:"💍", coins:100, price:7.99 },
  { id:"g6", name:"Diamond", icon:"💎", coins:200, price:14.99 },
  { id:"g7", name:"Champagne", icon:"🍾", coins:60, price:4.99 },
  { id:"g8", name:"Teddy", icon:"🧸", coins:40, price:2.99 },
  { id:"g9", name:"Crown", icon:"👑", coins:150, price:11.99 },
  { id:"g10", name:"🔓 Unlock", icon:"🔓", coins:30, price:2.99 },
];

// ─── Matching ─────────────────────────────────────────────────────────────────
function calcMatch(a, b) {
  let score = 0;
  const ci = (a.interests||[]).filter(i=>(b.interests||[]).includes(i));
  score += Math.round((ci.length/Math.max((a.interests||[]).length,(b.interests||[]).length,1))*40);
  const ad = Math.abs(parseInt(a.age||25)-parseInt(b.age||25));
  score += ad<=2?20:ad<=5?15:ad<=8?10:ad<=12?5:0;
  score += a.city===b.city?20:0;
  const cl = (a.lifestyle||[]).filter(l=>(b.lifestyle||[]).includes(l));
  score += Math.round((cl.length/Math.max((a.lifestyle||[]).length,(b.lifestyle||[]).length,1))*20);
  return Math.min(score,100);
}

function matchLabel(score) {
  if(score>=90) return {label:"Perfect Match ✨",color:"#22c55e"};
  if(score>=75) return {label:"Great Match 💕",color:CORAL};
  if(score>=60) return {label:"Good Match 😊",color:"#f59e0b"};
  return {label:"Potential 🌱",color:"#8b5cf6"};
}

// ─── Upload to Cloudinary ─────────────────────────────────────────────────────
async function uploadPhoto(file) {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);
  form.append("folder", "nosingle/profiles");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method:"POST", body:form });
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error("Upload failed");
}

// ─── Main App ─────────────────────────────────────────────────────────────────
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
  const [userVerified, setUserVerified] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [swipeDir, setSwipeDir] = useState(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [likes, setLikes] = useState([]);
  const [showMatch, setShowMatch] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [superLikesLeft, setSuperLikesLeft] = useState(1);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [selectedGiftProfile, setSelectedGiftProfile] = useState(null);
  const [giftHistory, setGiftHistory] = useState([]);
  const [notification, setNotification] = useState(null);
  const [unreadCount, setUnreadCount] = useState(3);
  const [pushEnabled, setPushEnabled] = useState(false);

  const dragStart = useRef(null);
  const msgEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auth listener
  useEffect(() => {
    // Timeout fallback — if Firebase takes too long, go to auth screen
    const timeout = setTimeout(() => {
      setLoading(false);
      setScreen("auth");
    }, 5000);

    const unsub = onAuthStateChanged(auth, async (u) => {
      clearTimeout(timeout);
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) {
            setUserProfile(snap.data());
            setScreen("app");
          } else {
            setScreen("setup");
          }
        } catch(e) {
          setScreen("setup");
        }
      } else {
        setScreen("auth");
      }
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  useEffect(() => { setTimeout(() => { if(screen==="splash") setScreen("auth"); }, 1500); }, []);
  useEffect(() => { msgEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

  // Realtime chat
  useEffect(() => {
    if (!activeChat || !user) return;
    const chatId = [user.uid, activeChat.id].sort().join("_");
    const unsub = onValue(ref(rtdb, `chats/${chatId}`), (snap) => {
      const data = snap.val();
      setMessages(data ? Object.values(data).sort((a,b) => (a.timestamp||0)-(b.timestamp||0)) : []);
      setTimeout(() => msgEndRef.current?.scrollIntoView({behavior:"smooth"}), 100);
    });
    return () => unsub();
  }, [activeChat, user]);

  const showNotif = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const rankedProfiles = useMemo(() => {
    if (!userProfile) return PROFILES;
    return PROFILES.map(p => ({...p, matchScore: calcMatch(userProfile, p)})).sort((a,b) => b.matchScore - a.matchScore);
  }, [userProfile]);

  const current = rankedProfiles[cardIndex % rankedProfiles.length];
  const next = rankedProfiles[(cardIndex+1) % rankedProfiles.length];
  const isPremium = plan !== "free";
  const isGold = plan === "gold" || plan === "platinum";

  // Auth handlers
  const handleAuth = async () => {
    setAuthError("");
    try {
      if (authMode === "register") {
        await createUserWithEmailAndPassword(auth, form.email, form.password);
        setScreen("setup");
      } else {
        await signInWithEmailAndPassword(auth, form.email, form.password);
      }
    } catch (e) {
      setAuthError(e.message.includes("user-not-found")||e.message.includes("wrong-password") ? "Email atau password salah" : e.message.includes("email-already") ? "Email sudah terdaftar" : "Terjadi error, coba lagi");
    }
  };

  const handleGoogle = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { setAuthError("Login Google gagal"); }
  };

  const handleSetup = async () => {
    if (!form.name || !form.age || !form.city) { setAuthError("Lengkapi semua field!"); return; }
    setUploading(true);
    let photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name)}&background=E8735A&color=fff&size=200`;
    if (photoFile) {
      try { photoUrl = await uploadPhoto(photoFile); } catch(e) { console.log("Upload error"); }
    }
    const profile = { uid:user.uid, name:form.name, age:parseInt(form.age), city:form.city, bio:form.bio, gender:form.gender, email:user.email, photo:photoUrl, interests:[], lifestyle:[], matches:[], likes:[], coins:150, gifts:0, verified:false, createdAt:new Date().toISOString() };
    await setDoc(doc(db, "users", user.uid), profile);
    setUserProfile(profile);
    setUploading(false);
    setScreen("app");
  };

  // Swipe
  const swipe = async (dir, isSuper=false) => {
    if (isSuper && superLikesLeft <= 0) { showNotif("Super Like habis! Upgrade Premium ⭐"); return; }
    if (isSuper) setSuperLikesLeft(p => p-1);
    setSwipeDir(dir);
    if (dir === "right" || isSuper) {
      setLikes(p => [...p, current.id]);
      setMatchedProfile(current);
      setTimeout(() => setShowMatch(true), 350);
      setTimeout(() => setShowMatch(false), 3000);
      if (user) { try { await updateDoc(doc(db, "users", user.uid), { likes: arrayUnion(current.id) }); } catch(e){} }
    }
    setTimeout(() => { setSwipeDir(null); setDragX(0); setCardIndex(i => i+1); }, 380);
  };

  const onMD = (e) => { dragStart.current = e.clientX; setIsDragging(true); };
  const onMM = (e) => { if(!isDragging) return; setDragX(e.clientX - dragStart.current); };
  const onMU = () => { if(dragX>80) swipe("right"); else if(dragX<-80) swipe("left"); else setDragX(0); setIsDragging(false); dragStart.current=null; };

  // Chat
  const sendMsg = async () => {
    if (!msgInput.trim() || !activeChat || !user) return;
    const chatId = [user.uid, activeChat.id].sort().join("_");
    const t = new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
    await push(ref(rtdb, `chats/${chatId}`), { text:msgInput, from:user.uid, fromName:userProfile?.name||"User", time:t, timestamp:serverTimestamp() });
    setMsgInput("");
    // Simulate reply
    const replies = ["Wah seru! 😊","Haha iya!","Boleh banget!","Kapan ketemuan? ☕","Kamu asik! 😄"];
    setTimeout(async () => {
      await push(ref(rtdb, `chats/${chatId}`), { text:replies[Math.floor(Math.random()*replies.length)], from:activeChat.id, fromName:activeChat.name, time:new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}), timestamp:serverTimestamp() });
      setUnreadCount(c => c+1);
    }, 1500);
  };

  // Gift
  const sendGift = (gift) => {
    if (!selectedGiftProfile) { showNotif("Pilih profil dulu!"); return; }
    if (coins < gift.coins) { showNotif("Coins tidak cukup! 🪙"); return; }
    setCoins(c => c - gift.coins);
    setGiftHistory(h => [{id:Date.now(), gift, to:selectedGiftProfile.name, time:"Baru saja"}, ...h]);
    showNotif(`${gift.icon} ${gift.name} terkirim ke ${selectedGiftProfile.name}!`);
  };

  // Request push permission
  const requestPush = async () => {
    if (!("Notification" in window)) { showNotif("Browser tidak support push notif"); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setPushEnabled(true);
      new Notification("NoSingle 💕", { body:"Push notification aktif! Kamu akan dapat notif real-time." });
      showNotif("🔔 Push notification aktif!");
    } else {
      showNotif("Push notification ditolak");
    }
  };

  const planBadge = plan==="platinum"?{icon:"💎",grad:"linear-gradient(135deg,#a78bfa,#7C3AED)"}:plan==="gold"?{icon:"⭐",grad:"linear-gradient(135deg,#f5d380,#C9965A)"}:null;

  // ── LOADING ──
  if (loading) return (
    <div style={{...s.root,alignItems:"center",justifyContent:"center"}}>
      <style>{css}</style>
      <div style={s.splashLogo}>No<span style={{color:CORAL,fontStyle:"italic"}}>Single</span></div>
      <div style={{display:"flex",gap:8,marginTop:20}}>{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:"50%",background:CORAL,animation:"bounce 0.7s infinite alternate",animationDelay:`${i*0.2}s`}}/>)}</div>
    </div>
  );

  // ── SPLASH ──
  if (screen === "splash") return (
    <div style={{...s.root,alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#fff5f2,#fde8df,#fce0ec)"}}>
      <style>{css}</style>
      <div className="splash-in" style={s.splashLogo}>No<span style={{color:CORAL,fontStyle:"italic"}}>Single</span></div>
      <div className="splash-sub" style={{fontSize:16,color:TEXT2,marginTop:8}}>Temukan pasanganmu ✨</div>
      <div style={{display:"flex",gap:8,marginTop:24}}>{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:"50%",background:CORAL,animation:"bounce 0.7s infinite alternate",animationDelay:`${i*0.2}s`}}/>)}</div>
    </div>
  );

  // ── AUTH ──
  if (screen === "auth") return (
    <div style={s.root}>
      <style>{css}</style>
      <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#fff5f2,#fde8df,#fce0ec)",zIndex:0}}/>
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"60px 24px 40px",minHeight:"100vh"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={s.splashLogo}>No<span style={{color:CORAL,fontStyle:"italic"}}>Single</span></div>
          <div style={{fontSize:15,color:TEXT2,marginTop:8}}>Temukan pasanganmu hari ini ✨</div>
        </div>
        <div style={s.card}>
          <div style={s.authTabs}>
            {["login","register"].map(m=>(
              <button key={m} style={{...s.authTab,...(authMode===m?s.authTabActive:{})}} onClick={()=>{setAuthMode(m);setAuthError("");}}>
                {m==="login"?"Masuk":"Daftar"}
              </button>
            ))}
          </div>
          <input type="email" placeholder="Email" style={s.input} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
          <input type="password" placeholder="Password" style={s.input} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/>
          {authError && <div style={s.errMsg}>{authError}</div>}
          <button style={s.primaryBtn} onClick={handleAuth}>{authMode==="login"?"Masuk →":"Daftar Sekarang →"}</button>
          <div style={{textAlign:"center",color:TEXT2,fontSize:13,margin:"4px 0 12px"}}>atau</div>
          <button style={{...s.primaryBtn,background:"#f0ebe8",color:TEXT,boxShadow:"none",marginBottom:0}} onClick={handleGoogle}>
            G &nbsp; Lanjut dengan Google
          </button>
        </div>
      </div>
    </div>
  );

  // ── SETUP ──
  if (screen === "setup") return (
    <div style={s.root}>
      <style>{css}</style>
      <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#fff5f2,#fde8df,#fce0ec)",zIndex:0}}/>
      <div style={{position:"relative",zIndex:1,padding:"40px 24px",minHeight:"100vh"}}>
        <div style={{display:"flex",gap:6,marginBottom:24}}>
          {[1,2,3].map(i=><div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=setupStep?CORAL:"rgba(232,115,90,0.2)",transition:"background 0.3s"}}/>)}
        </div>
        <div style={s.card}>
          {setupStep===1 && (
            <>
              <div style={{fontSize:20,fontWeight:800,marginBottom:6,textAlign:"center"}}>Upload Foto 📸</div>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{width:100,height:100,borderRadius:"50%",border:`3px dashed ${CORAL}`,margin:"0 auto 8px",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(232,115,90,0.04)"}}
                  onClick={()=>fileInputRef.current?.click()}>
                  {photoPreview ? <img src={photoPreview} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/> : <span style={{fontSize:36}}>🤳</span>}
                </div>
                <div style={{fontSize:12,color:TEXT2}}>Tap untuk upload foto</div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);const r=new FileReader();r.onload=ev=>setPhotoPreview(ev.target.result);r.readAsDataURL(f);}}}/>
              </div>
              <button style={s.primaryBtn} onClick={()=>setSetupStep(2)}>Lanjut →</button>
            </>
          )}
          {setupStep===2 && (
            <>
              <div style={{fontSize:20,fontWeight:800,marginBottom:16,textAlign:"center"}}>Tentang Kamu 👤</div>
              {[["Nama lengkap *","name","text"],["Usia *","age","number"],["Bio singkat","bio","text"]].map(([ph,key,type])=>(
                <input key={key} type={type} placeholder={ph} style={s.input} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/>
              ))}
              <select style={s.input} value={form.gender} onChange={e=>setForm(p=>({...p,gender:e.target.value}))}>
                <option value="">Gender *</option>
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
                <option value="other">Lainnya</option>
              </select>
              <select style={s.input} value={form.city} onChange={e=>setForm(p=>({...p,city:e.target.value}))}>
                {["Jakarta","Bandung","Surabaya","Bali","Yogyakarta","Medan","Semarang","Singapore","Kuala Lumpur","Sydney","Melbourne","Tokyo","Seoul"].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              {authError && <div style={s.errMsg}>{authError}</div>}
              <div style={{display:"flex",gap:10}}>
                <button style={{...s.primaryBtn,flex:1,background:"#f0ebe8",color:TEXT,boxShadow:"none"}} onClick={()=>setSetupStep(1)}>← Kembali</button>
                <button style={{...s.primaryBtn,flex:2,marginBottom:0}} onClick={()=>setSetupStep(3)}>Lanjut →</button>
              </div>
            </>
          )}
          {setupStep===3 && (
            <>
              <div style={{fontSize:20,fontWeight:800,marginBottom:4,textAlign:"center"}}>Hampir Selesai! 🎉</div>
              <div style={{fontSize:13,color:TEXT2,textAlign:"center",marginBottom:20}}>Konfirmasi profil kamu</div>
              <div style={{textAlign:"center",marginBottom:16}}>
                <img src={photoPreview||`https://ui-avatars.com/api/?name=${form.name}&background=E8735A&color=fff`} style={{width:80,height:80,borderRadius:"50%",objectFit:"cover",border:`3px solid ${CORAL}`}} alt=""/>
                <div style={{fontSize:18,fontWeight:800,marginTop:8}}>{form.name}, {form.age}</div>
                <div style={{fontSize:13,color:TEXT2}}>{form.city}</div>
              </div>
              {authError && <div style={s.errMsg}>{authError}</div>}
              <button style={s.primaryBtn} onClick={handleSetup} disabled={uploading}>
                {uploading ? "Menyimpan... ⏳" : "Mulai Explore NoSingle 🚀"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ── SUB-SCREENS ──
  if (subScreen === "chat" && activeChat) return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif} className="notif-in">{notification}</div>}
      <div style={{display:"flex",alignItems:"center",gap:11,padding:"12px 16px",borderBottom:"1px solid rgba(45,31,26,0.08)",background:"rgba(253,248,245,0.95)",position:"sticky",top:0,zIndex:10}}>
        <button style={s.backBtn} onClick={()=>setSubScreen(null)}>‹</button>
        <img src={activeChat.photo} style={{width:42,height:42,borderRadius:"50%",objectFit:"cover",border:`2px solid ${CORAL}`}} alt=""/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:16,fontWeight:700}}>{activeChat.name}</span>
            {activeChat.verified && <span style={s.verifiedBadge}>✓</span>}
          </div>
          <div style={{fontSize:12,color:TEXT2}}>🟢 Online · {activeChat.matchScore}% match</div>
        </div>
        <button style={{background:"rgba(232,115,90,0.1)",border:"none",borderRadius:10,width:36,height:36,fontSize:16,cursor:"pointer"}} onClick={()=>{setSelectedGiftProfile(activeChat);setSubScreen("gift");}}>🎁</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 16px 8px",display:"flex",flexDirection:"column",gap:10}}>
        {messages.length===0 && <div style={{textAlign:"center",padding:"40px 0",color:TEXT2}}><div style={{fontSize:40,marginBottom:8}}>💌</div><div>Mulai percakapan dengan {activeChat.name}!</div></div>}
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",flexDirection:"column",maxWidth:"72%",alignSelf:m.from===user?.uid?"flex-end":"flex-start",alignItems:m.from===user?.uid?"flex-end":"flex-start"}}>
            <div style={m.from===user?.uid?{background:`linear-gradient(135deg,${CORAL},${ROSE})`,color:"white",padding:"10px 15px",borderRadius:"18px 18px 5px 18px",fontSize:14,lineHeight:1.5}:{background:"white",color:TEXT,padding:"10px 15px",borderRadius:"18px 18px 18px 5px",fontSize:14,lineHeight:1.5,boxShadow:"0 2px 8px rgba(45,31,26,0.08)"}}>{m.text}</div>
            <div style={{fontSize:10,color:"#b0a0a0",marginTop:4}}>{m.time}</div>
          </div>
        ))}
        <div ref={msgEndRef}/>
      </div>
      <div style={{display:"flex",gap:9,padding:"10px 14px 14px",background:"white",borderTop:"1px solid rgba(45,31,26,0.07)",alignItems:"center"}}>
        <button style={{background:"none",border:"none",fontSize:22,cursor:"pointer"}} onClick={()=>{setSelectedGiftProfile(activeChat);setSubScreen("gift");}}>🎁</button>
        <input style={{flex:1,background:"#FDF0EC",border:"none",borderRadius:22,padding:"10px 16px",fontSize:14,outline:"none",color:TEXT,fontFamily:"inherit"}}
          placeholder="Tulis sesuatu yang manis... 🌸" value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()}/>
        <button style={{background:`linear-gradient(135deg,${CORAL},${ROSE})`,border:"none",borderRadius:"50%",width:42,height:42,color:"white",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onClick={sendMsg}>➤</button>
      </div>
    </div>
  );

  if (subScreen === "gift") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif} className="notif-in">{notification}</div>}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:"1px solid rgba(45,31,26,0.08)",position:"sticky",top:0,background:"rgba(253,248,245,0.95)",zIndex:10}}>
        <button style={s.backBtn} onClick={()=>setSubScreen(null)}>‹</button>
        <div style={{flex:1,fontSize:18,fontWeight:800}}>Gift Shop 🎁</div>
        <div style={{display:"flex",alignItems:"center",gap:4,background:"white",borderRadius:12,padding:"5px 10px",fontSize:12,fontWeight:700,color:"#C9965A",cursor:"pointer"}} onClick={()=>setSubScreen("coinShop")}>🪙 {coins} +</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:16}}>
        <div style={{fontSize:13,fontWeight:700,color:TEXT2,marginBottom:8}}>Kirim ke:</div>
        <div style={{display:"flex",gap:10,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
          {PROFILES.map(p=>(
            <div key={p.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer",flexShrink:0,opacity:selectedGiftProfile?.id===p.id?1:0.5}} onClick={()=>setSelectedGiftProfile(p)}>
              <div style={{borderRadius:"50%",padding:2,background:selectedGiftProfile?.id===p.id?`linear-gradient(135deg,${CORAL},${ROSE})`:"transparent"}}>
                <img src={p.photo} style={{width:48,height:48,borderRadius:"50%",objectFit:"cover",border:"2px solid white"}} alt={p.name}/>
              </div>
              <span style={{fontSize:10,fontWeight:600}}>{p.name}</span>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {GIFTS.map(g=>(
            <div key={g.id} style={{background:"white",borderRadius:14,padding:"12px 8px",textAlign:"center",boxShadow:"0 2px 10px rgba(45,31,26,0.07)",cursor:"pointer"}} onClick={()=>sendGift(g)}>
              <div style={{fontSize:28,marginBottom:4}}>{g.icon}</div>
              <div style={{fontSize:11,fontWeight:700,marginBottom:3}}>{g.name}</div>
              <div style={{fontSize:10,color:"#C9965A",fontWeight:700}}>🪙{g.coins}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (subScreen === "coinShop") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif} className="notif-in">{notification}</div>}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:"1px solid rgba(45,31,26,0.08)",position:"sticky",top:0,background:"rgba(253,248,245,0.95)",zIndex:10}}>
        <button style={s.backBtn} onClick={()=>setSubScreen(null)}>‹</button>
        <div style={{flex:1,fontSize:18,fontWeight:800}}>Beli Coins 🪙</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        <div style={{textAlign:"center",background:"linear-gradient(135deg,#fff8e7,#fef3d0)",borderRadius:20,padding:20,marginBottom:20}}>
          <div style={{fontSize:48}}>🪙</div>
          <div style={{fontSize:32,fontWeight:800,color:"#C9965A"}}>{coins}</div>
          <div style={{fontSize:14,color:TEXT2}}>NoSingle Coins</div>
        </div>
        {[{coins:100,price:0.99,bonus:0,label:"Starter",icon:"🪙"},{coins:500,price:3.99,bonus:50,label:"Popular 🔥",icon:"💰",popular:true},{coins:1200,price:7.99,bonus:200,label:"Value",icon:"💎"},{coins:3000,price:17.99,bonus:800,label:"Best Deal ⭐",icon:"👑"}].map(pkg=>(
          <div key={pkg.coins} style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px rgba(45,31,26,0.07)",cursor:"pointer",border:pkg.popular?`2px solid ${CORAL}`:"none",position:"relative"}}
            onClick={()=>{setCoins(c=>c+pkg.coins+pkg.bonus);showNotif(`💰 +${pkg.coins+pkg.bonus} coins ditambahkan!`);setSubScreen(null);}}>
            {pkg.popular && <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${CORAL},${ROSE})`,color:"white",fontSize:10,fontWeight:700,padding:"3px 12px",borderRadius:20,whiteSpace:"nowrap"}}>🔥 Populer</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:28}}>{pkg.icon}</span>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:"#C9965A"}}>{pkg.coins.toLocaleString()} Coins</div>
                  {pkg.bonus>0 && <div style={{fontSize:11,color:"#22c55e",fontWeight:600}}>+{pkg.bonus} bonus! 🎁</div>}
                  <div style={{fontSize:11,color:TEXT2}}>{pkg.label}</div>
                </div>
              </div>
              <div style={{fontSize:20,fontWeight:800,color:CORAL}}>${pkg.price}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (subScreen === "premium") return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif} className="notif-in">{notification}</div>}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:"1px solid rgba(45,31,26,0.08)",position:"sticky",top:0,background:"rgba(253,248,245,0.95)",zIndex:10}}>
        <button style={s.backBtn} onClick={()=>setSubScreen(null)}>‹</button>
        <div style={{flex:1,fontSize:18,fontWeight:800}}>✨ NoSingle Premium</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        {[
          {id:"gold",name:"Gold",icon:"⭐",grad:"linear-gradient(135deg,#f5d380,#C9965A)",color:"#C9965A",price:"$5.99/mo",features:["Lihat yang suka kamu","5 Super Likes/hari","Undo swipe","Gold badge","Tanpa iklan"]},
          {id:"platinum",name:"Platinum",icon:"💎",grad:"linear-gradient(135deg,#a78bfa,#7C3AED)",color:"#7C3AED",price:"$9.99/mo",popular:true,features:["Semua fitur Gold","Unlimited Super Likes","Weekly boost","Read receipts","Platinum badge"]},
        ].map(p=>(
          <div key={p.id} style={{background:"white",borderRadius:20,padding:20,marginBottom:16,boxShadow:"0 4px 20px rgba(45,31,26,0.08)",position:"relative",...(p.popular?{border:"2px solid #7C3AED"}:{})}}>
            {p.popular && <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#a78bfa,#7C3AED)",color:"white",fontSize:11,fontWeight:700,padding:"4px 14px",borderRadius:20,whiteSpace:"nowrap"}}>⭐ Paling Populer</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:24}}>{p.icon}</span><span style={{fontSize:20,fontWeight:800}}>{p.name}</span></div>
                <div style={{fontSize:22,fontWeight:800,color:p.color}}>{p.price}</div>
              </div>
              <button style={{background:p.grad,border:"none",borderRadius:14,padding:"10px 18px",color:"white",fontSize:14,fontWeight:700,cursor:"pointer"}}
                onClick={()=>{setPlan(p.id);setSuperLikesLeft(p.id==="platinum"?999:5);setSubScreen(null);showNotif(`🎉 NoSingle ${p.name} aktif!`);}}>
                Pilih
              </button>
            </div>
            {p.features.map(f=><div key={f} style={{display:"flex",gap:8,padding:"4px 0",fontSize:13}}><span style={{color:p.color,fontWeight:700}}>✓</span>{f}</div>)}
          </div>
        ))}
      </div>
    </div>
  );

  // ── MAIN APP ──
  const ml = current?.matchScore ? matchLabel(current.matchScore) : null;

  return (
    <div style={s.root}>
      <style>{css}</style>
      {notification && <div style={s.notif} className="notif-in">{notification}</div>}
      <div style={s.blob1}/><div style={s.blob2}/>

      <header style={s.header}>
        <div style={s.logo}>No<span style={{color:CORAL,fontStyle:"italic"}}>Single</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {planBadge && <div style={{background:planBadge.grad,borderRadius:12,padding:"4px 8px",fontSize:12,color:"white",fontWeight:700}}>{planBadge.icon}</div>}
          <div style={{display:"flex",alignItems:"center",gap:4,background:"white",borderRadius:12,padding:"5px 10px",fontSize:12,fontWeight:700,color:"#C9965A",cursor:"pointer",boxShadow:"0 2px 8px rgba(201,150,90,0.15)"}} onClick={()=>setSubScreen("coinShop")}>🪙 {coins}</div>
          <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setSubScreen("notifications")}>
            <span style={{fontSize:22}}>🔔</span>
            {unreadCount>0 && <div style={{position:"absolute",top:-4,right:-4,background:CORAL,borderRadius:"50%",width:16,height:16,fontSize:9,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{unreadCount}</div>}
          </div>
          <img src={userProfile?.photo||`https://ui-avatars.com/api/?name=${userProfile?.name||"U"}&background=E8735A&color=fff`} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",border:`2px solid ${userVerified?"#22c55e":CORAL}`,cursor:"pointer"}} alt="me" onClick={()=>setTab("profile")}/>
        </div>
      </header>

      <main style={s.main}>
        {/* DISCOVER */}
        {tab==="discover" && current && (
          <div style={s.discoverWrap}>
            <div style={s.discoverTop}>
              <div>
                <div style={s.greeting}>Halo, {userProfile?.name?.split(" ")[0]} 👋</div>
                <div style={{fontSize:13,color:TEXT2,marginTop:2}}>Temukan pasanganmu hari ini</div>
              </div>
              <button style={{background:`linear-gradient(135deg,${CORAL},${ROSE})`,border:"none",borderRadius:20,padding:"7px 14px",fontSize:12,color:"white",fontWeight:700,cursor:"pointer"}} onClick={()=>setSubScreen("premium")}>✨ Premium</button>
            </div>
            <div style={s.stackWrap}>
              <div style={{...s.cardEl,...s.cardBack}}><img src={next.photo} style={s.cardPhoto} alt="" draggable={false}/></div>
              <div className={swipeDir==="right"?"fly-right":swipeDir==="left"?"fly-left":"card-enter"}
                style={{...s.cardEl,transform:`translateX(${dragX}px) rotate(${dragX*0.04}deg)`,transition:isDragging?"none":"transform 0.18s ease",cursor:isDragging?"grabbing":"grab",zIndex:2}}
                onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
                <img src={current.photo} style={s.cardPhoto} alt={current.name} draggable={false}/>
                <div style={s.cardOverlay}/>
                {dragX>40 && <div style={{...s.swipeBadge,left:18,color:"#22c55e",borderColor:"#22c55e",background:"rgba(34,197,94,0.1)",opacity:Math.min(dragX/100,1)}}>SUKA 💚</div>}
                {dragX<-40 && <div style={{...s.swipeBadge,right:18,color:"#ef4444",borderColor:"#ef4444",background:"rgba(239,68,68,0.1)",opacity:Math.min(-dragX/100,1)}}>LEWAT 💔</div>}
                <div style={s.matchPill}>
                  <span style={{color:ml?.color,fontWeight:800}}>{current.matchScore}%</span>
                  <span style={{fontSize:11,color:TEXT2,marginLeft:4}}>{ml?.label}</span>
                </div>
                <div style={s.cardBottom}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={s.cardName}>{current.name}</span>
                    <span style={{fontSize:18,color:"rgba(255,255,255,0.75)"}}>{current.age}</span>
                    {current.verified && <span style={{background:"#22c55e",color:"white",fontSize:10,fontWeight:800,padding:"2px 7px",borderRadius:10}}>✓</span>}
                  </div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.65)",marginBottom:6}}>📍 {current.job} · {current.city}</div>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"3px 8px",fontSize:11,color:"white"}}>🎁 {current.gifts}</div>
                    <div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"3px 8px",fontSize:11,color:"white"}}>🪙 {current.coins.toLocaleString()}</div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{current.interests.map(i=><span key={i} style={s.tag}>{i}</span>)}</div>
                </div>
              </div>
            </div>
            <div style={s.btnRow}>
              <button style={{...s.roundBtn,width:52,height:52,background:"white",boxShadow:"0 4px 16px rgba(239,68,68,0.2)",color:"#ef4444",fontSize:18}} onClick={()=>swipe("left")}>✕</button>
              <button style={{...s.roundBtn,width:44,height:44,background:"rgba(232,115,90,0.1)",fontSize:16}} onClick={()=>{setSelectedGiftProfile(current);setSubScreen("gift");}}>🎁</button>
              <button style={{...s.roundBtn,width:58,height:58,background:`linear-gradient(135deg,${CORAL},${ROSE})`,boxShadow:`0 6px 24px rgba(232,115,90,0.4)`,color:"white",fontSize:22}} onClick={()=>swipe("right")}>♥</button>
              <button style={{...s.roundBtn,width:44,height:44,background:superLikesLeft>0?"rgba(201,150,90,0.1)":"rgba(0,0,0,0.05)",fontSize:16,position:"relative"}} onClick={()=>swipe("right",true)}>
                ⭐{superLikesLeft>0 && <div style={{position:"absolute",top:-4,right:-4,background:CORAL,borderRadius:"50%",width:16,height:16,fontSize:9,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{superLikesLeft}</div>}
              </button>
            </div>
          </div>
        )}

        {/* MATCHES */}
        {tab==="matches" && (
          <div style={{padding:"16px 20px"}}>
            <div style={{fontSize:22,fontWeight:800,marginBottom:16}}>Koneksi 💞</div>
            <div style={{background:isGold?"white":"linear-gradient(135deg,#fde8df,#fce0ec)",borderRadius:20,padding:14,marginBottom:20,boxShadow:"0 2px 12px rgba(45,31,26,0.06)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:14,fontWeight:800}}>Yang Suka Kamu ❤️</div>
                {!isGold && <button style={{background:`linear-gradient(135deg,${CORAL},${ROSE})`,border:"none",borderRadius:12,padding:"4px 10px",color:"white",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setSubScreen("premium")}>Unlock</button>}
              </div>
              <div style={{display:"flex",gap:8}}>
                {PROFILES.filter(p=>p.likedUser).map((p,i)=>(
                  <div key={p.id} style={{position:"relative"}}>
                    <img src={p.photo} style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",filter:isGold?"none":"blur(8px)",border:`2px solid ${CORAL}`}} alt=""/>
                    {!isGold && i===0 && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🔒</div>}
                  </div>
                ))}
              </div>
            </div>
            {rankedProfiles.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid rgba(45,31,26,0.06)",cursor:"pointer"}}
                onClick={()=>{setActiveChat(p);setMessages([]);setSubScreen("chat");}}>
                <div style={{position:"relative",flexShrink:0}}>
                  <img src={p.photo} style={{width:54,height:54,borderRadius:"50%",objectFit:"cover"}} alt={p.name}/>
                  <div style={{position:"absolute",bottom:0,right:0,background:p.matchScore>=75?"#22c55e":CORAL,borderRadius:10,padding:"1px 5px",fontSize:9,color:"white",fontWeight:700}}>{p.matchScore}%</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:15,fontWeight:700}}>{p.name}, {p.age}</span>
                    {p.verified && <span style={s.verifiedBadge}>✓</span>}
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:3}}>
                    <span style={{fontSize:11,color:"#C9965A"}}>🪙{p.coins.toLocaleString()}</span>
                    <span style={{fontSize:11,color:CORAL}}>🎁{p.gifts}</span>
                  </div>
                </div>
                <button style={{background:"rgba(232,115,90,0.1)",border:"none",borderRadius:10,padding:"6px 10px",fontSize:14,cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSelectedGiftProfile(p);setSubScreen("gift");}}>🎁</button>
              </div>
            ))}
          </div>
        )}

        {/* SHOP */}
        {tab==="shop" && (
          <div style={{padding:"16px 20px"}}>
            <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>Gift Shop 🎁</div>
            <div style={{fontSize:13,color:TEXT2,marginBottom:16}}>Kirim hadiah ke orang yang kamu suka</div>
            <div style={{background:"linear-gradient(135deg,#fff8e7,#fef3d0)",borderRadius:18,padding:14,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,cursor:"pointer"}} onClick={()=>setSubScreen("coinShop")}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:28}}>🪙</span>
                <div><div style={{fontSize:18,fontWeight:800,color:"#C9965A"}}>{coins} Coins</div><div style={{fontSize:11,color:TEXT2}}>Tap untuk beli lebih</div></div>
              </div>
              <button style={{background:`linear-gradient(135deg,${CORAL},${ROSE})`,border:"none",borderRadius:12,padding:"8px 14px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Beli</button>
            </div>
            <div style={{fontSize:13,fontWeight:700,color:TEXT2,marginBottom:8}}>Kirim ke:</div>
            <div style={{display:"flex",gap:10,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
              {PROFILES.map(p=>(
                <div key={p.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer",flexShrink:0,opacity:selectedGiftProfile?.id===p.id?1:0.5}} onClick={()=>setSelectedGiftProfile(p)}>
                  <div style={{borderRadius:"50%",padding:2,background:selectedGiftProfile?.id===p.id?`linear-gradient(135deg,${CORAL},${ROSE})`:"transparent"}}>
                    <img src={p.photo} style={{width:48,height:48,borderRadius:"50%",objectFit:"cover",border:"2px solid white"}} alt={p.name}/>
                  </div>
                  <span style={{fontSize:10,fontWeight:600}}>{p.name}</span>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {GIFTS.map(g=>(
                <div key={g.id} style={{background:"white",borderRadius:14,padding:"12px 8px",textAlign:"center",boxShadow:"0 2px 10px rgba(45,31,26,0.07)",cursor:"pointer"}} onClick={()=>sendGift(g)}>
                  <div style={{fontSize:28,marginBottom:4}}>{g.icon}</div>
                  <div style={{fontSize:11,fontWeight:700,marginBottom:3}}>{g.name}</div>
                  <div style={{fontSize:10,color:"#C9965A",fontWeight:700}}>🪙{g.coins}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {tab==="profile" && (
          <div style={{paddingBottom:20}}>
            <div style={{height:110,background:`linear-gradient(135deg,#fde8df,#fce0ec)`,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
              <div style={{marginBottom:-40,borderRadius:"50%",padding:3,background:userVerified?"linear-gradient(135deg,#22c55e,#16a34a)":planBadge?.grad||`linear-gradient(135deg,${CORAL},${ROSE})`}}>
                <img src={userProfile?.photo||`https://ui-avatars.com/api/?name=${userProfile?.name||"U"}&background=E8735A&color=fff`} style={{width:84,height:84,borderRadius:"50%",objectFit:"cover",border:"3px solid white",display:"block"}} alt="me"/>
              </div>
            </div>
            <div style={{padding:"52px 20px 16px",textAlign:"center"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <div style={{fontSize:22,fontWeight:800}}>{userProfile?.name}, {userProfile?.age}</div>
                {userVerified && <div style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",fontSize:11,fontWeight:800,padding:"3px 9px",borderRadius:12}}>✓</div>}
                {planBadge && <div style={{background:planBadge.grad,borderRadius:12,padding:"3px 8px",fontSize:11,color:"white",fontWeight:700}}>{planBadge.icon}</div>}
              </div>
              <div style={{fontSize:14,color:TEXT2,marginTop:4,marginBottom:16}}>{userProfile?.city} 📍</div>
              <div style={{display:"flex",gap:10,marginBottom:20}}>
                {[[likes.length,"Likes"],["3","Match"],[coins,"Coins"],[giftHistory.length,"Gifts Sent"]].map(([n,l])=>(
                  <div key={l} style={{flex:1,background:"white",borderRadius:14,padding:"12px 4px",textAlign:"center",boxShadow:"0 2px 10px rgba(45,31,26,0.06)"}}>
                    <div style={{fontSize:18,fontWeight:800,color:CORAL}}>{n}</div>
                    <div style={{fontSize:10,color:TEXT2,marginTop:1}}>{l}</div>
                  </div>
                ))}
              </div>
              {[
                ["🛡️",userVerified?"Sudah Verified ✓":"Verifikasi Foto",userVerified?"Profilmu terpercaya":"Dapat 50 coins gratis!",()=>setSubScreen("verify"),!userVerified],
                ["✨","Premium",plan==="free"?"Upgrade sekarang":`Plan: ${plan}`,()=>setSubScreen("premium"),plan==="free"],
                ["🪙","Beli Coins",`Saldo: ${coins} coins`,()=>setSubScreen("coinShop"),false],
                ["🔔","Notifikasi","Atur push & email notif",()=>setSubScreen("notifications"),false],
                ["🌐","Bahasa & Negara","195 negara tersedia",()=>setSubScreen("langPicker"),false],
                ["🔒","Privasi","Kelola data akun",null,false],
              ].map(([icon,label,sub,action,highlight])=>(
                <div key={label} style={{display:"flex",alignItems:"center",gap:13,padding:"13px 0",borderBottom:"1px solid rgba(45,31,26,0.06)",cursor:"pointer",textAlign:"left"}} onClick={action||undefined}>
                  <div style={{width:40,height:40,borderRadius:13,background:highlight?"rgba(232,115,90,0.12)":"rgba(232,115,90,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,color:highlight?CORAL:TEXT}}>{label}</div>
                    <div style={{fontSize:12,color:TEXT2,marginTop:1}}>{sub}</div>
                  </div>
                  <div style={{fontSize:22,color:"#c8b8b8"}}>›</div>
                </div>
              ))}
              <button style={{width:"100%",marginTop:20,background:"none",border:`1.5px solid rgba(232,115,90,0.3)`,borderRadius:14,padding:"13px",fontSize:14,fontWeight:600,color:CORAL,cursor:"pointer"}} onClick={()=>signOut(auth)}>
                Keluar 👋
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Match Popup */}
      {showMatch && matchedProfile && (
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(45,31,26,0.6)",backdropFilter:"blur(12px)",padding:20}} className="match-fade">
          <div style={{background:"white",borderRadius:28,padding:"28px 20px",textAlign:"center",maxWidth:320,width:"100%"}}>
            <div style={{fontSize:48,marginBottom:8}}>💞</div>
            <div style={{fontSize:28,fontWeight:800,color:CORAL,marginBottom:4}}>It's a Match!</div>
            <div style={{fontSize:14,color:TEXT2,marginBottom:16}}>Kamu dan <strong>{matchedProfile.name}</strong> saling tertarik</div>
            <img src={matchedProfile.photo} style={{width:80,height:80,borderRadius:"50%",objectFit:"cover",border:`3px solid ${CORAL}`,margin:"0 auto 16px",display:"block"}} alt=""/>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <button style={{...s.primaryBtn,flex:1,marginBottom:0,fontSize:13,padding:"11px"}} onClick={()=>{setShowMatch(false);setActiveChat(matchedProfile);setMessages([]);setSubScreen("chat");}}>💬 Chat</button>
              <button style={{...s.primaryBtn,flex:1,marginBottom:0,fontSize:13,padding:"11px",background:"rgba(232,115,90,0.1)",color:CORAL,boxShadow:"none"}} onClick={()=>{setShowMatch(false);setSelectedGiftProfile(matchedProfile);setSubScreen("gift");}}>🎁 Gift</button>
            </div>
            <button style={{background:"none",border:"none",color:TEXT2,fontSize:13,cursor:"pointer"}} onClick={()=>setShowMatch(false)}>Lanjut Explore</button>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <nav style={s.bottomNav}>
        {[{id:"discover",icon:"🔥",label:"Discover"},{id:"matches",icon:"💞",label:"Matches"},{id:"shop",icon:"🎁",label:"Shop"},{id:"profile",icon:"👤",label:"Profil"}].map(({id,icon,label})=>{
          const active = tab===id;
          return (
            <button key={id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",color:active?CORAL:TEXT2,padding:"4px 0",position:"relative"}} onClick={()=>setTab(id)}>
              <span style={{fontSize:20}}>{icon}</span>
              <span style={{fontSize:9,fontWeight:600}}>{label}</span>
              {active && <div style={{position:"absolute",bottom:-2,width:4,height:4,borderRadius:"50%",background:CORAL}}/>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

const s = {
  root:{background:SOFT_BG,minHeight:"100vh",maxWidth:430,margin:"0 auto",display:"flex",flexDirection:"column",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",color:TEXT,position:"relative",overflow:"hidden"},
  blob1:{position:"fixed",top:-80,right:-80,width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(232,115,90,0.1) 0%,transparent 70%)",pointerEvents:"none",zIndex:0},
  blob2:{position:"fixed",bottom:60,left:-60,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,rgba(212,135,156,0.08) 0%,transparent 70%)",pointerEvents:"none",zIndex:0},
  splashLogo:{fontSize:38,fontWeight:800,color:TEXT},
  card:{background:"white",borderRadius:24,padding:24,width:"100%",maxWidth:360,boxShadow:"0 8px 40px rgba(232,115,90,0.15)"},
  authTabs:{display:"flex",marginBottom:20,background:"#f5f0ee",borderRadius:14,padding:4},
  authTab:{flex:1,padding:"10px",border:"none",background:"none",borderRadius:10,cursor:"pointer",fontSize:14,fontWeight:600,color:TEXT2},
  authTabActive:{background:"white",color:TEXT,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},
  input:{width:"100%",background:"#fdf5f2",border:"1.5px solid rgba(232,115,90,0.15)",borderRadius:14,padding:"13px 16px",fontSize:14,color:TEXT,outline:"none",marginBottom:12,boxSizing:"border-box",fontFamily:"inherit"},
  errMsg:{color:"#ef4444",fontSize:13,marginBottom:12,textAlign:"center"},
  primaryBtn:{width:"100%",background:`linear-gradient(135deg,${CORAL},${ROSE})`,border:"none",borderRadius:14,padding:"14px",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:`0 6px 20px rgba(232,115,90,0.35)`,marginBottom:12},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px 10px",background:"rgba(253,248,245,0.9)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(232,115,90,0.1)",position:"sticky",top:0,zIndex:10},
  logo:{fontSize:22,fontWeight:800},
  main:{flex:1,overflowY:"auto",overflowX:"hidden",position:"relative",zIndex:1,paddingBottom:70},
  discoverWrap:{padding:"14px 16px 0",display:"flex",flexDirection:"column",alignItems:"center"},
  discoverTop:{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14},
  greeting:{fontSize:20,fontWeight:800},
  stackWrap:{position:"relative",width:"100%",maxWidth:370,height:470,marginBottom:8},
  cardEl:{position:"absolute",inset:0,borderRadius:26,overflow:"hidden",boxShadow:"0 12px 40px rgba(45,31,26,0.12)"},
  cardBack:{transform:"scale(0.93) translateY(14px)",zIndex:0,filter:"brightness(0.85)"},
  cardPhoto:{width:"100%",height:"100%",objectFit:"cover",display:"block",pointerEvents:"none"},
  cardOverlay:{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(45,31,26,0.9) 0%,rgba(45,31,26,0.15) 55%,transparent 100%)"},
  swipeBadge:{position:"absolute",top:24,padding:"7px 16px",borderRadius:14,fontSize:14,fontWeight:800,letterSpacing:1,border:"2.5px solid",zIndex:5},
  matchPill:{position:"absolute",top:14,left:"50%",transform:"translateX(-50%)",background:"rgba(255,255,255,0.95)",fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:20,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4,zIndex:3},
  cardBottom:{position:"absolute",bottom:0,left:0,right:0,padding:"18px 18px 16px"},
  cardName:{fontSize:26,fontWeight:800,color:"white"},
  tag:{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.25)",color:"white",fontSize:11,padding:"3px 10px",borderRadius:20},
  btnRow:{display:"flex",alignItems:"center",justifyContent:"center",gap:12,paddingBottom:8,marginTop:4},
  roundBtn:{border:"none",cursor:"pointer",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"},
  verifiedBadge:{background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"white",fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:8},
  backBtn:{background:"none",border:"none",fontSize:28,color:CORAL,cursor:"pointer",padding:0,width:32},
  notif:{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",background:"#22c55e",color:"white",fontSize:13,fontWeight:600,padding:"10px 20px",borderRadius:20,zIndex:100,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.15)"},
  bottomNav:{display:"flex",background:"white",borderTop:"1px solid rgba(45,31,26,0.08)",padding:"6px 0 10px",position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,zIndex:10},
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  button:active { transform: scale(0.96); }
  select { appearance: none; }
  .fly-right { animation: flyRight 0.38s ease forwards; }
  .fly-left  { animation: flyLeft 0.38s ease forwards; }
  .card-enter { animation: cardIn 0.4s cubic-bezier(.34,1.56,.64,1) both; }
  .match-fade { animation: matchIn 0.35s cubic-bezier(.34,1.56,.64,1); }
  .splash-in  { animation: splashIn 0.6s cubic-bezier(.34,1.56,.64,1) both; }
  .splash-sub { animation: splashIn 0.6s 0.2s cubic-bezier(.34,1.56,.64,1) both; }
  .notif-in   { animation: slideDown 0.3s cubic-bezier(.34,1.56,.64,1); }
  @keyframes flyRight   { to { transform: translateX(130%) rotate(22deg); opacity:0; } }
  @keyframes flyLeft    { to { transform: translateX(-130%) rotate(-22deg); opacity:0; } }
  @keyframes cardIn     { from { transform:scale(0.92) translateY(12px); opacity:0.6; } to { transform:scale(1); opacity:1; } }
  @keyframes matchIn    { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
  @keyframes splashIn   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes bounce     { from { transform:translateY(0); } to { transform:translateY(-8px); } }
  @keyframes slideDown  { from { opacity:0; transform:translateX(-50%) translateY(-20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
`;
