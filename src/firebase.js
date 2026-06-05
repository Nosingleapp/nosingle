import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDVwJHU3NEXVh5IqznrQkGZjnrW40ytb7I",
  authDomain: "no-single-30b71.firebaseapp.com",
  projectId: "no-single-30b71",
  storageBucket: "no-single-30b71.firebasestorage.app",
  messagingSenderId: "887104707383",
  appId: "1:887104707383:web:d8215e4c965310da4d98b2",
  measurementId: "G-7VZ486JQZX",
  databaseURL: "https://no-single-30b71-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
export default app;
