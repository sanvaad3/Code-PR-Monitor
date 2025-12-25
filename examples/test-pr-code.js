// Test file with intentional issues for PR review testing
// This demonstrates various issues the AI reviewer should catch

// Security Issue: SQL Injection vulnerability
function getUserData(userId) {
  const query = "SELECT * FROM users WHERE id = " + userId; // Dangerous!
  return db.query(query);
}

// Performance Issue: Inefficient loop
function processUsers(users) {
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (users[i].id === users[j].friendId) {
        console.log("Found friend");
      }
    }
  }
}

// Code Quality: Unclear variable names
function calc(a, b, c) {
  const x = a * b;
  const y = x / c;
  const z = y + 100;
  return z;
}

// Bug: Potential null reference
function getUserName(user) {
  return user.profile.name; // What if user.profile is null?
}

// Architecture: Mixed concerns
function saveAndEmailUser(userData) {
  // Saving to database
  db.save(userData);

  // Sending email (should be separate)
  email.send(userData.email, "Welcome!");

  // Logging (should be separate)
  console.log("User saved:", userData.id);

  return userData;
}

// Export for testing
module.exports = {
  getUserData,
  processUsers,
  calc,
  getUserName,
  saveAndEmailUser
};
