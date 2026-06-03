import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import pickle

# 1. Load your custom dataset
print("📊 Loading dataset...")
try:
    df = pd.read_csv('gesture_dataset.csv')
except FileNotFoundError:
    print("❌ Error: gesture_dataset.csv not found!")
    exit()

# Separate the answers (labels) from the math (features)
X = df.drop('label', axis=1) # The 42 X/Y coordinates
y = df['label']              # The gesture names

# 2. Split the data
# We hide 20% of the data from the AI to test it later and ensure it's not just memorizing.
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 3. Create and Train the AI (The "Brain")
print(f"🧠 Training Random Forest Classifier on {len(X_train)} frames...")
model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
model.fit(X_train, y_train)

# 4. Test the AI on the hidden 20%
print("🧪 Testing accuracy on hidden data...")
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred) * 100

print("\n========================================")
print(f"🏆 MODEL ACCURACY: {accuracy:.2f}%")
print("========================================")
print("\nDetailed Breakdown:")
print(classification_report(y_test, y_pred))

# 5. Save the trained "Brain" to a file
model_filename = 'custom_gesture_model.pkl'
with open(model_filename, 'wb') as f:
    pickle.dump(model, f)

print(f"\n💾 Success! Custom model saved as: {model_filename}")
print("You can now plug this directly into app.py!")