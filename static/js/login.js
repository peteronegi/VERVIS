document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("errorMsg");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const username = document.getElementById("username");
    const password = document.getElementById("password");

    let valid = true;
    errorMsg.textContent = "";

    [username, password].forEach((input) => {
      input.classList.remove("invalid");
    });

    // Simple validation (make sure fields aren’t empty)
    if (username.value.trim() === "") {
      errorMsg.textContent = "Username is required.";
      username.classList.add("invalid");
      valid = false;
    }

    if (password.value.trim() === "") {
      errorMsg.textContent = "Password is required.";
      password.classList.add("invalid");
      valid = false;
    }

    // ✅ If valid, let Flask handle login + redirect
    if (valid) {
      form.submit();
    }
  });
});

// Password toggle function
function togglePassword(fieldId, icon) {
  const input = document.getElementById(fieldId);
  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}
