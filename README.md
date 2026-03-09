# Visual Python

An interactive web-based educational platform designed to teach Python programming concepts through hands-on tutorials and levels. This project combines visual learning with practical coding exercises to help beginners understand fundamental programming concepts.

## Overview

Visual Python is a gamified learning platform that guides users through progressive programming levels, starting with basic concepts and advancing to more complex topics. Each level includes interactive tutorials, code challenges, and immediate feedback to reinforce learning.

## Features

- **Progressive Learning Levels**: 5 structured levels that build upon each other
  - Level 1: Introduction & Basics
  - Level 2: Variables & Data Types
  - Level 3: Area Calculations (Applied Math)
  - Level 4: User Input & Interaction
  - Level 5: Combined Concepts (Level 3 + Level 4)
  
- **Interactive Tutorials**: Tutorial system with indexed lessons for guided learning
- **Audio Support**: Sound effects and audio feedback for enhanced learning experience
- **Responsive Web Interface**: Browser-based platform accessible from any device
- **Real-time Feedback**: Immediate validation of code and learning progress

## Project Structure

```
visualpython/
├── index.html              # Main landing page
├── tutorial-index.html     # Tutorial navigation page
├── tutorial-manager.js     # Tutorial system logic
├── script.js               # Core application logic
├── style.css               # Global styling
├── server.js               # Node.js server
├── package.json            # Project dependencies
├── level-data.js           # Level configuration and data
├── git.ignore.js           # Git ignore configuration
├── README.md               # This file
└── levels/                 # Level-specific content
    ├── lvl1/               # Level 1: Basics
    ├── lvl2-variables/     # Level 2: Variables
    ├── lvl3-area/          # Level 3: Area Calculations
    ├── lvl4-input/         # Level 4: User Input
    ├── lvl5 - 3+4/         # Level 5: Combined Concepts
    └── sounds/             # Audio assets for levels
```

## System Requirements

### Environment
- **Node.js**: v14.0.0 or higher
- **npm**: v6.0.0 or higher
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Screen Resolution**: Minimum 1024x768 (Responsive design)

### Dependencies
- Express.js (for server)
- Standard HTML5, CSS3, and JavaScript (ES6+)

## Installation & Setup

### 1. Prerequisites
- Install Node.js from https://nodejs.org/
- Verify installation:
  ```bash
  node --version
  npm --version
  ```

### 2. Installation Steps

1. Clone or download the project:
   ```bash
   git clone <repository-url>
   cd visualpython
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   # or
   node server.js
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

### For Students
1. **Start Learning**: Click on a level to begin that module
2. **Follow Tutorials**: Complete the tutorial section for guidance
3. **Practice Code**: Write and test Python code concepts
4. **Get Feedback**: Receive immediate feedback on your code
5. **Progress**: Unlock the next level upon completion

### For Instructors/Administrators
- Modify level content in the `levels/` directory
- Update level data in `level-data.js`
- Customize styling in `style.css`
- Add new levels following the existing folder structure

## Technical Details

### Frontend Technologies
- **HTML5**: Semantic markup and structure
- **CSS3**: Responsive design and animations
- **JavaScript (ES6+)**: Interactive functionality and logic

### Backend Technologies
- **Node.js**: Server runtime environment
- **Express.js**: Web framework (configured in server.js)

### Level Configuration
- Each level is self-contained with its own HTML, CSS, and JavaScript
- Audio files stored in `sounds/` directories for immersive experience
- Central `level-data.js` coordinates level information and progression

## File Descriptions

| File | Purpose |
|------|---------|
| `index.html` | Main entry point and landing page |
| `script.js` | Core application logic and level management |
| `style.css` | Global styles and theme |
| `server.js` | Node.js/Express server configuration |
| `package.json` | Project metadata and dependencies |
| `level-data.js` | Level definitions and progression logic |
| `tutorial-manager.js` | Tutorial system and lesson management |
| `tutorial-index.html` | Tutorial browsing interface |

## Development Guidelines

### Adding a New Level
1. Create a new folder in `levels/` following the naming convention
2. Include `index.html`, script file, and styles file
3. Add audio assets to a `sounds/` subfolder if needed
4. Update `level-data.js` with new level configuration
5. Test the level in the browser

### Customization
- **Colors & Fonts**: Edit `style.css` for global styling
- **Level Content**: Modify individual level HTML files
- **Level Logic**: Update corresponding JavaScript files in each level folder
- **Audio**: Replace audio files in `sounds/` directories

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server won't start | Check if port 3000 is in use; verify Node.js is installed |
| Styles not loading | Clear browser cache; check CSS file paths |
| Audio not playing | Check browser audio permissions; verify audio files exist |
| Levels not loading | Verify folder structure; check level-data.js configuration |

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Chrome 90+ | ✅ Supported |
| Firefox 88+ | ✅ Supported |
| Safari 14+ | ✅ Supported |
| Edge 90+ | ✅ Supported |

## Performance Considerations

- Audio files are loaded on-demand to optimize initial page load
- CSS is minified for production use
- JavaScript uses efficient DOM manipulation
- Responsive design minimizes bandwidth on mobile devices

## Future Enhancements

- [ ] User authentication and progress tracking
- [ ] Leaderboard and achievement system
- [ ] Additional programming concepts and levels
- [ ] Mobile app version
- [ ] Offline mode support
- [ ] Internationalization (multiple languages)
- [ ] Advanced analytics dashboard
- [ ] Peer review and collaboration features

## License

[Add your license information here]

## Contributors

[Add contributor information here]

## Support & Contact

For questions, issues, or suggestions, please contact:
- Project Lead: [Contact Information]
- Email: [Email Address]

## Changelog

### Version 1.0.0 (Week 6 Prototype)
- Initial release with 5 progressive levels
- Tutorial system implementation
- Audio support across levels
- Responsive web design

---

**Last Updated**: January 2026  
**Status**: Active Development