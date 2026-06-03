document.addEventListener("DOMContentLoaded", () => {
  // ---------------- Get session data from container ----------------
  const container = document.getElementById("settings-container");
  const sessionRole = container ? container.dataset.role : "user";
  const sessionUsername = container ? container.dataset.username : "";

  // ---------------- Tab Switching ----------------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });

  // ---------------- Toggle Password Visibility (The Eye Icon!) ----------------
  const passwordField = document.getElementById("password");
  const togglePassword = document.getElementById("toggle-password");
  
  if (togglePassword && passwordField) {
    togglePassword.addEventListener("click", () => {
      const type = passwordField.type === "password" ? "text" : "password";
      passwordField.type = type;
      togglePassword.classList.toggle("fa-eye");
      togglePassword.classList.toggle("fa-eye-slash");
    });
  }

  const confirmPasswordField = document.getElementById("confirm-password");
  const toggleConfirmPassword = document.getElementById("toggle-confirm-password");
  
  if (toggleConfirmPassword && confirmPasswordField) {
    toggleConfirmPassword.addEventListener("click", () => {
      const type = confirmPasswordField.type === "password" ? "text" : "password";
      confirmPasswordField.type = type;
      toggleConfirmPassword.classList.toggle("fa-eye");
      toggleConfirmPassword.classList.toggle("fa-eye-slash");
    });
  }

  // ---------------- Password Strength Check ----------------
  const passwordStrength = document.getElementById("password-strength");
  
  if (passwordField && passwordStrength) {
    passwordField.addEventListener("input", () => {
      const pwd = passwordField.value;
      if (!pwd) {
        passwordStrength.textContent = "";
        return;
      }
      
      let strength = "Weak";
      let color = "red";
      const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
      const mediumRegex = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;

      if (strongRegex.test(pwd)) { strength = "Strong"; color = "green"; }
      else if (mediumRegex.test(pwd)) { strength = "Medium"; color = "orange"; }

      passwordStrength.textContent = `Password Strength: ${strength}`;
      passwordStrength.style.color = color;
    });
  }

  // ---------------- Save Profile ----------------
  const saveProfileBtn = document.getElementById("save-profile");
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", async () => {
      const email = document.getElementById("email").value.trim();
      const username = document.getElementById("username").value.trim();
      const password = passwordField.value.trim();
      const confirmPassword = confirmPasswordField.value.trim();
      const profileMsg = document.getElementById("profile-message");

      if (password || confirmPassword) {
        if (password !== confirmPassword) {
          profileMsg.textContent = "❌ Passwords do not match!";
          profileMsg.style.color = "red";
          return;
        }
        const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!strongRegex.test(password)) {
          profileMsg.textContent = "❌ Password too weak. Need 8+ chars, uppercase, lowercase, number & symbol.";
          profileMsg.style.color = "red";
          return;
        }
      }

      profileMsg.textContent = "Saving...";
      profileMsg.style.color = "blue";

      try {
        const response = await fetch("/save-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, username, password })
        });
        const result = await response.json();
        
        profileMsg.textContent = result.message || "Profile saved!";
        profileMsg.style.color = response.ok ? "green" : "red";

        passwordField.value = "";
        confirmPasswordField.value = "";
        passwordStrength.textContent = "";
      } catch (error) {
        profileMsg.textContent = "❌ Network error while saving.";
        profileMsg.style.color = "red";
      }

      setTimeout(() => { profileMsg.textContent = ""; }, 3000);
    });
  }

  // ---------------- Save Translation ----------------
  const saveTranslationBtn = document.getElementById("save-translation");
  if (saveTranslationBtn) {
    saveTranslationBtn.addEventListener("click", async () => {
      const language = document.getElementById("language").value;
      const messageBox = document.getElementById("translation-message");
      
      messageBox.textContent = "Saving...";
      messageBox.style.color = "blue";

      try {
        const response = await fetch("/save-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language })
        });
        
        const result = await response.json();
        messageBox.textContent = result.message || "Language updated!";
        messageBox.style.color = response.ok ? "green" : "red";

        localStorage.setItem("preferredLanguage", language);
        window.dispatchEvent(new Event("languageChanged"));
        
      } catch (error) {
        messageBox.textContent = "❌ Network error. Could not save.";
        messageBox.style.color = "red";
      }

      setTimeout(() => { messageBox.textContent = ""; }, 3000);
    });
  }

  // ---------------- Save Response Preference ----------------
  const saveResponseBtn = document.getElementById("save-response");
  if (saveResponseBtn) {
    saveResponseBtn.addEventListener("click", async () => {
      const radio = document.querySelector('input[name="response-type"]:checked');
      const messageBox = document.getElementById("response-message");

      if (!radio) {
        messageBox.textContent = "❌ Please select an option.";
        messageBox.style.color = "red";
        return;
      }

      const preference = radio.value;
      messageBox.textContent = "Saving...";
      messageBox.style.color = "blue";

      try {
        const response = await fetch("/save-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responsePreference: preference })
        });
        
        const result = await response.json();
        messageBox.textContent = result.message || "Preference saved!";
        messageBox.style.color = response.ok ? "green" : "red";

        localStorage.setItem("responsePreference", preference);
        window.dispatchEvent(new Event("responsePreferenceChanged"));

      } catch (error) {
        messageBox.textContent = "❌ Network error. Could not save.";
        messageBox.style.color = "red";
      }

      setTimeout(() => { messageBox.textContent = ""; }, 3000);
    });
  }

  // ---------------- Admin User Management ----------------
  async function loadAdminUsers() {
    try {
      const response = await fetch("/get-all-users");
      if (!response.ok) return;
      
      const data = await response.json();
      const tbody = document.querySelector("#users-table tbody");
      if (!tbody) return;
      
      tbody.innerHTML = "";

      for (const username in data) {
        if (username === sessionUsername) continue;
        const user = data[username];
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${username} ${user.role === "admin" ? '<span class="admin-badge">ADMIN</span>' : ''}</td>
          <td>${user.email}</td>
          <td>${user.role}</td>
          <td>
            <button class="promote-btn" data-username="${username}">
              ${user.role === "user" ? "Promote to Admin" : "Demote to User"}
            </button>
            <button class="delete-btn" data-username="${username}">Delete</button>
          </td>
        `;
        if (user.role === "admin") tr.classList.add("admin-row");
        tbody.appendChild(tr);
      }

      // ---------------- Admin Button Handlers ----------------
      tbody.querySelectorAll(".promote-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const uname = btn.dataset.username;
          const action = btn.textContent.includes("Promote") ? "promote" : "demote";
          const adminMsg = document.getElementById("admin-message");

          const res = await fetch("/admin-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: uname, action })
          });
          const result = await res.json();
          adminMsg.textContent = result.message;

          // Update row dynamically
          const row = btn.closest("tr");
          const roleCell = row.querySelectorAll("td")[2];
          const usernameCell = row.querySelectorAll("td")[0];
          
          if (res.ok && !result.message.includes("❌")) {
            if (action === "promote") {
              roleCell.textContent = "admin";
              usernameCell.innerHTML = `${uname} <span class="admin-badge">ADMIN</span>`;
              btn.textContent = "Demote to User";
              row.classList.add("admin-row");
            } else {
              roleCell.textContent = "user";
              usernameCell.innerHTML = uname;
              btn.textContent = "Promote to Admin";
              row.classList.remove("admin-row");
            }
          }
          setTimeout(() => { adminMsg.textContent = ""; }, 3000);
        });
      });

      tbody.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const uname = btn.dataset.username;
          const adminMsg = document.getElementById("admin-message");
          
          const res = await fetch("/admin-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: uname, action: "delete" })
          });
          const result = await res.json();
          adminMsg.textContent = result.message;

          const row = btn.closest("tr");
          if (res.ok && !result.message.includes("❌")) { 
            row.remove();
          }
          setTimeout(() => { adminMsg.textContent = ""; }, 3000);
        });
      });

    } catch (error) {
      console.error("Error loading admin users:", error);
    }
  }

  if (sessionRole === "admin") {
      loadAdminUsers();
  }
});