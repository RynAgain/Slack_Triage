// ==UserScript==
// @name         DPE2 Pick & Stage Performance
// @namespace    https://phonetool.amazon.com/users/fakhara
// @version      9.1.5
// @description  Bubble trigger for break overlay
// @author       fakhara
// @match        https://logistics.amazon.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- CSS ---
    var breakStyles = `
        #pp-bubble {
            position: fixed; bottom: 25px; right: 25px; width: 60px; height: 60px;
            background-color: #4a90e2; color: white; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 28px; cursor: pointer; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 2990; user-select: none; transition: all 0.2s;
        }
        #pp-bubble:hover { transform: scale(1.1); }
        .break-screen-wrapper {
            display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 15, 15, 0.98); z-index: 9999999;
            flex-direction: column; justify-content: center; align-items: center;
            font-family: sans-serif; user-select: none;
        }
        .break-content h1 { color: #fff; font-size: 3.5rem; margin: 0 0 20px 0; font-weight: 800; }
        .break-content p { color: #aaa; font-size: 1.8rem; margin: 0 0 40px 0; }
        .resume-btn {
            padding: 12px 30px; font-size: 1.1rem; font-weight: bold; color: #fff;
            background: #4a90e2; border: none; border-radius: 4px; cursor: pointer;
        }
        .resume-btn:hover { background: #357abd; }
        .close-x { position: absolute; top: 30px; right: 40px; font-size: 40px; color: #666; cursor: pointer; }
        .close-x:hover { color: #fff; }
    `;

    // Inject Styles
    var styleEl = document.createElement('style');
    styleEl.textContent = breakStyles;
    document.head.appendChild(styleEl);

    // Inject HTML
    var bubbleHTML = '<div id="pp-bubble" title="Break Time">☕</div>';
    var screenHTML = `
        <div id="breakScreen" class="break-screen-wrapper">
            <span class="close-x">&times;</span>
            <div class="break-content" style="text-align: center;">
                <h1>Taking a break</h1>
                <p>Will be back shortly. Thank you for your patience.</p>
                <button class="resume-btn">I'm Back</button>
            </div>
             <div style="position: absolute; bottom: 30px; color: #666; font-size: 0.9rem;">
                Script by <span style="color: #4a90e2; font-weight: bold;">fakhara</span>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', bubbleHTML);
    document.body.insertAdjacentHTML('beforeend', screenHTML);

    // Logic
    var bubble = document.getElementById('pp-bubble');
    var screen = document.getElementById('breakScreen');
    var btns = screen.querySelectorAll('.resume-btn, .close-x');

    // Drag Logic
    var isDragging = false;
    var offset = { x: 0, y: 0 };

    bubble.addEventListener('mousedown', function(e) {
        if(e.button !== 0) return;
        isDragging = false;
        var rect = bubble.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;

        function mouseMove(e) {
            isDragging = true;
            bubble.style.right = 'auto';
            bubble.style.bottom = 'auto';
            bubble.style.left = (e.clientX - offset.x) + 'px';
            bubble.style.top = (e.clientY - offset.y) + 'px';
        }

        function mouseUp() {
            document.removeEventListener('mousemove', mouseMove);
            document.removeEventListener('mouseup', mouseUp);
        }
        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mouseup', mouseUp);
    });

    bubble.addEventListener('click', function() {
        if(!isDragging) {
            bubble.style.display = 'none';
            screen.style.display = 'flex';
        }
    });

    btns.forEach(function(b) {
        b.addEventListener('click', function() {
            screen.style.display = 'none';
            bubble.style.display = 'flex';
        });
    });

})();