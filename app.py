import os
import json
import base64
import re
import io
import traceback
import time
import random
import sys
import pickle
import warnings 

# Silence sklearn warnings to keep your terminal clean
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

# Flask & Extensions
from flask import Flask, redirect, url_for, session, request, render_template, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from requests_oauthlib import OAuth2Session
from dotenv import load_dotenv
load_dotenv()


# ML & Translation Libraries
from langdetect import detect
from googletrans import Translator
from PIL import Image
import numpy as np
import requests
import cv2
import mediapipe as mp

# ---------------- Flask App Setup ----------------
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
app = Flask(__name__)
app.secret_key = "your_secret_key"

# ---------------- Database Configuration ----------------
# 🚨 NEW: Smart pathing to ensure the database saves next to the .exe
if getattr(sys, 'frozen', False):
    # If running as a PyInstaller .exe, use the folder where the .exe is located
    base_dir = os.path.dirname(sys.executable)
else:
    # If running normally via Python, use the project folder
    base_dir = os.path.abspath(os.path.dirname(__file__))

db_path = os.path.join(base_dir, 'vervis.db')

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Cookie Security for OAuth
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False 

db = SQLAlchemy(app)

# ---------------- User Model ----------------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=True)
    role = db.Column(db.String(20), default="user")
    language = db.Column(db.String(10), default="en")
    response_preference = db.Column(db.String(20), default="text")

    def to_dict(self):
        return {
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "language": self.language,
            "responsePreference": self.response_preference
        }

with app.app_context():
    db.create_all()

# ---------------- Translator ----------------
g_translator = None
def get_translator():
    global g_translator
    if g_translator is None:
        g_translator = Translator()
    return g_translator

# ---------------- Google OAuth2 Config ----------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = "http://localhost:5000/authorize/google"
SCOPE = ["openid", "email", "profile"]

# ---------------- Routes ----------------
@app.route("/")
def landing(): return render_template("landing.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user = User.query.filter_by(username=request.form["username"]).first()
        if user and user.password == request.form["password"]:
            session["username"], session["role"] = user.username, user.role
            return redirect(url_for("dashboard"))
        return "Invalid username or password", 401
    return render_template("login.html")

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username, email, password = request.form["username"], request.form["email"], request.form["password"]
        if User.query.filter((User.username == username) | (User.email == email)).first():
            return "Username or Email already exists!", 400
        new_user = User(username=username, email=email, password=password, role="user")
        db.session.add(new_user)
        db.session.commit()
        session["username"], session["role"] = username, "user"
        return redirect(url_for("dashboard"))
    return render_template("signup.html")

@app.route("/help")
def user_manual():
    # Allows both logged-in and guest users to view the manual
    username = session.get("username") 
    role = session.get("role")
    return render_template("help.html", username=username, role=role)

@app.route("/login/google")
def login_google():
    session.permanent = True
    google = OAuth2Session(GOOGLE_CLIENT_ID, scope=SCOPE, redirect_uri=REDIRECT_URI)
    authorization_url, state = google.authorization_url("https://accounts.google.com/o/oauth2/auth", access_type="offline", prompt="consent")
    session["oauth_state"] = state
    return redirect(authorization_url)

@app.route("/authorize/google")
def authorize_google():
    google = OAuth2Session(GOOGLE_CLIENT_ID, redirect_uri=REDIRECT_URI, state=session.get("oauth_state"))
    google.fetch_token("https://oauth2.googleapis.com/token", client_secret=GOOGLE_CLIENT_SECRET, authorization_response=request.url)
    email = google.get("https://www.googleapis.com/oauth2/v1/userinfo").json()["email"]
    user = User.query.filter_by(email=email).first()
    if not user:
        username = email.split("@")[0]
        while User.query.filter_by(username=username).first(): username = f"{email.split('@')[0]}{random.randint(1000, 9999)}"
        user = User(username=username, email=email, role="user")
        db.session.add(user)
        db.session.commit()
    session["username"], session["role"] = user.username, user.role
    return redirect(url_for("dashboard"))

@app.route("/dashboard")
def dashboard():
    if "username" not in session: return redirect(url_for("login"))
    return render_template("dashboard.html", username=session["username"], role=session["role"])

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/settings")
def settings():
    if "username" not in session: return redirect(url_for("login"))
    return render_template("settings.html", username=session.get("username"), role=session.get("role"))

# ---------------- Speech Translation ----------------
@app.route("/translate", methods=["POST"])
def translate_speech():
    data = request.get_json()
    text = data.get("text", "").strip()
    
    # 1. Grab the specific language requested by the frontend
    target_lang = data.get("target_lang")
    
    # 2. Fallback to database or English if something goes wrong
    if not target_lang:
        user = User.query.filter_by(username=session.get("username")).first()
        target_lang = user.language if user else "en"
        
    if not text: 
        return jsonify({"translated_text": ""})
        
    try:
        # 3. Force the translation to the requested language
        translated_text = get_translator().translate(text, dest=target_lang).text
    except Exception as e:
        print(f"Translation Error: {e}")
        translated_text = "Translation error."
        
    return jsonify({"translated_text": translated_text})

@app.route("/save-settings", methods=["POST"])
def save_settings():
    if "username" not in session:
        return jsonify({"message": "❌ Unauthorized"}), 401

    user = User.query.filter_by(username=session["username"]).first()
    if not user:
        return jsonify({"message": "❌ User not found"}), 404

    data = request.get_json()

    try:
        # Update Profile
        if "email" in data: user.email = data["email"]
        if "password" in data and data["password"]: user.password = data["password"]
        
        # Update Translation Language
        if "language" in data: user.language = data["language"]
        
        # Update Response Preference
        if "responsePreference" in data: user.response_preference = data["responsePreference"]

        db.session.commit()
        
        # Send the exact message the frontend is waiting for!
        return jsonify({"message": "✅ Settings saved successfully!"})

    except Exception as e:
        print(f"Error saving settings: {e}")
        return jsonify({"message": "❌ Server error while saving."}), 500

# ════════════════════════════════════════════════════════════════════════════════
# PURE CUSTOM MACHINE LEARNING TRANSLATION (STRICT SCOPE)
# ════════════════════════════════════════════════════════════════════════════════

mp_hands = mp.solutions.hands
hands_detector = mp_hands.Hands(
    static_image_mode=True, 
    max_num_hands=1, 
    min_detection_confidence=0.5
)
print("✅ Raw MediaPipe Landmark Tracker loaded successfully.")

print("🧠 Loading Custom Gesture Model...")
try:
    with open('custom_gesture_model.pkl', 'rb') as f:
        custom_ml_model = pickle.load(f)
    print("✅ Custom ML Model loaded successfully.")
except Exception as e:
    print(f"⚠️ Could not load ML model: {e}")
    custom_ml_model = None

# STRICT MAPPING: Only these 5 will ever be processed by the UI.
ML_LABEL_MAP = {
    'Closed_Fist': 'stop',
    'Pointing_Up': 'Hey there!',
    'Peace_Sign': 'Good afternoon',
    'Open_Palm': 'Hello!',
    'Thumbs_Up': 'Great job!',
    'Thumbs_Down': 'Not good!',
    'Horned_hand': ' I love you!',
    'Call_me_hand': 'Call me maybe?',
    'okay_sign': 'Okay!',
    'solidarity_hand': 'Solidarity!'
}

ML_THRESHOLDS = {
    'Closed_Fist': 0.70,
    'Pointing_Up': 0.15,
    'Peace_Sign': 0.80,
    'Open_Palm': 0.45,
    'Thumbs_Up': 0.50,
    'Thumbs_Down': 0.50,
    'Horned_hand': 0.15,
    'Call_me_hand': 0.20,
    'okay_sign': 0.30,
    'solidarity_hand': 0.50
}

def classify_hand(hand_landmarks):
    if not custom_ml_model:
        return "", 0.0
        
    wrist_x = hand_landmarks.landmark[0].x
    wrist_y = hand_landmarks.landmark[0].y
    wrist_z = hand_landmarks.landmark[0].z
    
    features = []
    for lm in hand_landmarks.landmark:
        features.append(lm.x - wrist_x)
        features.append(lm.y - wrist_y)
        features.append(lm.z - wrist_z)
        
    pred_label = custom_ml_model.predict([features])[0]
    probabilities = custom_ml_model.predict_proba([features])[0]
    confidence = max(probabilities)
    
    # 🚨 X-RAY VISION: Print what the AI thinks before any filters!
    print(f"👀 AI sees: {pred_label} ({confidence:.0%} confident)")

    required_confidence = ML_THRESHOLDS.get(pred_label, 0.75)
    
    # Check if it beats its specific passing grade!
    if confidence >= required_confidence and pred_label in ML_LABEL_MAP:
        return ML_LABEL_MAP[pred_label], float(confidence)
    
    return "", 0.0

# --- ROUTE 1: SINGLE FRAME ---
@app.route("/predict", methods=["POST"])
def predict():
    try:
        data       = request.get_json()
        image_data = re.sub('^data:image/.+;base64,', '', data["image"])
        nparr      = np.frombuffer(base64.b64decode(image_data), np.uint8)
        frame      = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None: return jsonify({"error": "Bad image"}), 400

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        results = hands_detector.process(rgb_frame)

        if not results.multi_hand_landmarks:
            return jsonify({"prediction": "", "confidence": 0.0})

        # Pure ML prediction
        label, confidence = classify_hand(results.multi_hand_landmarks[0])

        if label:
            print(f"🧠 ML DETECTED: {label} ({confidence:.0%})")

        return jsonify({
            "prediction": label,
            "confidence": confidence
        })

    except Exception as e:
        print(f"❌ Predict error: {e}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500


# --- ROUTE 2: SEQUENCE (VOTING) ---
@app.route("/predict_sequence", methods=["POST"])
def predict_sequence():
    try:
        frames_data = request.get_json().get("frames", [])
        if not frames_data: return jsonify({"error": "No frames"}), 400

        indices = np.linspace(0, len(frames_data) - 1, 5).astype(int)
        votes   = {}

        for idx in indices:
            image_data = re.sub('^data:image/.+;base64,', '', frames_data[idx])
            nparr      = np.frombuffer(base64.b64decode(image_data), np.uint8)
            frame      = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None: continue

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results   = hands_detector.process(rgb_frame)

            if results.multi_hand_landmarks:
                label, score = classify_hand(results.multi_hand_landmarks[0])
                if label:
                    if label not in votes or votes[label] < score:
                        votes[label] = score

        if not votes: return jsonify({"prediction": "", "confidence": 0.0})
        best_label = max(votes, key=votes.get)
        return jsonify({"prediction": best_label, "confidence": votes[best_label]})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)