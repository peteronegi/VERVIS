document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const errorMsg = document.getElementById("errorMsg");

  form.addEventListener("submit", (e) => {
    e.preventDefault(); // stop default for now

    const username = document.getElementById("username");
    const email = document.getElementById("email");
    const password = document.getElementById("password");
    const confirmPassword = document.getElementById("confirmPassword");

    let valid = true;
    errorMsg.textContent = "";

    // Reset invalid states
    [username, email, password, confirmPassword].forEach((input) => {
      input.classList.remove("invalid");
    });

    // Email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.value.trim())) {
      errorMsg.textContent = "Please enter a valid email.";
      email.classList.add("invalid");
      valid = false;
    }

    // Password strength
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strongPassword.test(password.value)) {
      errorMsg.textContent = "Password must be at least 8 chars, include uppercase, lowercase & number.";
      password.classList.add("invalid");
      valid = false;
    }

    // Confirm password
    if (password.value !== confirmPassword.value) {
      errorMsg.textContent = "Passwords do not match.";
      confirmPassword.classList.add("invalid");
      valid = false;
    }

    // ✅ If valid, allow form to submit to Flask
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
