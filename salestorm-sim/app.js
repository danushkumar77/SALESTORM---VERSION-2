const express = require('express');
const app = require('./server');

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.server.listen(PORT, () => {
    console.log(`🚀 SALESTORM active at http://localhost:${PORT}`);
  });
}

module.exports = app;
