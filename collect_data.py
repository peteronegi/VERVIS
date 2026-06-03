import cv2
import mediapipe as mp
import csv
import os

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=False, max_num_hands=1, min_detection_confidence=0.7)
mp_draw = mp.solutions.drawing_utils

csv_file = 'gesture_dataset.csv'

# --- THE SMART DATA MANAGER ---
# If the file doesn't exist, create it with headers.
if not os.path.exists(csv_file):
    with open(csv_file, mode='w', newline='') as f:
        writer = csv.writer(f)
        header = ['label'] + [f'{axis}{i}' for i in range(21) for axis in ['x', 'y', 'z']]
        writer.writerow(header)
    print("✨ Created a fresh, clean dataset!")
else:
    # If it does exist, we just append to it!
    print("📈 Found existing dataset! Adding new frames to make the AI smarter.")

# 🚨 Ensure this points to your DroidCam!
cap = cv2.VideoCapture(1) 

counts = {'Closed_Fist': 0, 'Pointing_Up': 0, 'Peace_Sign': 0, 'Open_Palm': 0, 'Thumbs_Up': 0, 'Thumbs_Down': 0, 'Horned_hand': 0, 'Call_me_hand': 0, 'okay_sign':0, 'solidarity_hand':0}
current_msg = "CLICK THIS WINDOW FIRST!"

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break

    # 1. PERFECT SQUARE CROP (Matches Web App)
    h, w, c = frame.shape
    size = min(h, w)
    startY = (h - size) // 2
    startX = (w - size) // 2
    frame = frame[startY:startY+size, startX:startX+size]

    # 2. NO MIRRORING (We want the true Right Hand!)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb_frame)

    # Draw UI
    cv2.putText(frame, current_msg, (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    stats = f"1:Fist({counts['Closed_Fist']}) | 2:Point({counts['Pointing_Up']}) | 3:Peace({counts['Peace_Sign']}) | 4:Palm({counts['Open_Palm']}) | 5:Thumbs({counts['Thumbs_Up']}) | 6:Thumbs_Down({counts['Thumbs_Down']}) | 7:Horned({counts['Horned_hand']}) | 8:Call_Me({counts['Call_me_hand']}) | 9:Okay({counts['okay_sign']}) | 10:Solidarity({counts['solidarity_hand']})"
    cv2.putText(frame, stats, (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            mp_draw.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

            key = cv2.waitKey(1) & 0xFF
            label = None
            
            if key == ord('1'): label = 'Closed_Fist'
            elif key == ord('2'): label = 'Pointing_Up'
            elif key == ord('3'): label = 'Peace_Sign'
            elif key == ord('4'): label = 'Open_Palm'
            elif key == ord('5'): label = 'Thumbs_Up'
            elif key == ord('6'): label = 'Thumbs_Down'
            elif key == ord('7'): label = 'Horned_hand'
            elif key == ord('8'): label = 'Call_me_hand'
            elif key == ord('9'): label = 'okay_sign'
            elif key == ord('0'): label = 'solidarity_hand'
            elif key == ord('q'): break

            if label:
                wrist_x = hand_landmarks.landmark[0].x
                wrist_y = hand_landmarks.landmark[0].y
                wrist_z = hand_landmarks.landmark[0].z
                row = [label]
                
                for lm in hand_landmarks.landmark:
                    row.append(lm.x - wrist_x)
                    row.append(lm.y - wrist_y)
                    row.append(lm.z - wrist_z)

                # Safely APPEND to the dataset
                with open(csv_file, mode='a', newline='') as f:
                    csv.writer(f).writerow(row)
                
                counts[label] += 1
                current_msg = f"✅ RECORDING: {label}..."
    else:
        current_msg = "No hand detected. Show hand!"

    cv2.imshow("Vervis Data Collector", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()