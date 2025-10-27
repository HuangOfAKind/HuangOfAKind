document.addEventListener('DOMContentLoaded', function() {
    const quizForm = document.getElementById('quiz-form');
    if (!quizForm) return;

    // Debug button to show all content
    const debugButton = document.getElementById('debug-show-all');
    if (debugButton) {
        debugButton.addEventListener('click', function() {
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.style.display = 'block';
                // Scroll to main content
                mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // correct answers here
    const correctAnswers = {
        question1: { value: 1560000000, description: "Active iPhones worldwide (2025 estimate)" },
        question2: { value: 3913000000000, description: "India GDP (2024, USD)" },
        question3: { value: 113, description: "Cities in China with >1M population (2021)" },
        question4: { value: 232908, description: "Toyota Corollas sold in US (2024)" },
        question5: { value: 101084, description: "Avg salary of CA public school teachers (2023-24, USD)" },
        question6: { value: 16881000, description: "Visitors to Disneyland Anaheim (2024)" },
        question7: { value: 50543000000, description: "L'Oréal Paris revenue (2024, USD)" },
        question8: { value: 2950000000, description: "WhatsApp monthly active users (2025)" },
        question9: { value: 30, description: "US states with a coastline (ocean or lake)" },
        question10: { value: 149, description: "Number of shows in Taylor Swift's Eras Tour" }
    };

    quizForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get all form values
        const answers = {
            question1: {
                low: parseFloat(document.getElementById('q1-low').value),
                high: parseFloat(document.getElementById('q1-high').value)
            },
            question2: {
                low: parseFloat(document.getElementById('q2-low').value),
                high: parseFloat(document.getElementById('q2-high').value)
            },
            question3: {
                low: parseFloat(document.getElementById('q3-low').value),
                high: parseFloat(document.getElementById('q3-high').value)
            },
            question4: {
                low: parseFloat(document.getElementById('q4-low').value),
                high: parseFloat(document.getElementById('q4-high').value)
            },
            question5: {
                low: parseFloat(document.getElementById('q5-low').value),
                high: parseFloat(document.getElementById('q5-high').value)
            },
            question6: {
                low: parseFloat(document.getElementById('q6-low').value),
                high: parseFloat(document.getElementById('q6-high').value)
            },
            question7: {
                low: parseFloat(document.getElementById('q7-low').value),
                high: parseFloat(document.getElementById('q7-high').value)
            },
            question8: {
                low: parseFloat(document.getElementById('q8-low').value),
                high: parseFloat(document.getElementById('q8-high').value)
            },
            question9: {
                low: parseFloat(document.getElementById('q9-low').value),
                high: parseFloat(document.getElementById('q9-high').value)
            },
            question10: {
                low: parseFloat(document.getElementById('q10-low').value),
                high: parseFloat(document.getElementById('q10-high').value)
            }
        };

        // Validate answers
        for (let question in answers) {
            if (answers[question].low >= answers[question].high) {
                alert('High end must be greater than low end for each question');
                return;
            }
        }

        localStorage.setItem('quizAnswers', JSON.stringify(answers));

        // calculate score
        let correctCount = 0;
        let resultsHTML = '<div class="container">';
        resultsHTML += '<div class="row"><div class="col-lg-10 mx-auto">';
        resultsHTML += '<h2 class="text-center mb-4">Quiz Results</h2>';
        
        // show results
        resultsHTML += '<div class="mb-4">';
        let questionNum = 1;
        for (let question in answers) {
            const correctValue = correctAnswers[question].value;
            const userLow = answers[question].low;
            const userHigh = answers[question].high;
            const isCorrect = correctValue >= userLow && correctValue <= userHigh;
            
            if (isCorrect) {
                correctCount++;
            }

            const statusIcon = isCorrect ? 'check_circle' : 'cancel';
            const statusClass = isCorrect ? 'text-success' : 'text-danger';
            const statusText = isCorrect ? 'Correct' : 'Incorrect';

            resultsHTML += `
                <div class="card mb-3 border">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <h6 class="mb-2">Question ${questionNum}</h6>
                            <small class="${statusClass} fw-bold d-flex align-items-center gap-1">
                                <span class="material-icons" style="font-size: 16px;">${statusIcon}</span>
                                ${statusText}
                            </small>
                        </div>
                        <p class="mb-1 text-muted small"><strong>Your range:</strong> ${userLow.toLocaleString()} - ${userHigh.toLocaleString()}</p>
                        <p class="mb-0 small"><strong>Correct answer:</strong> ${correctValue.toLocaleString()} <span class="text-muted">(${correctAnswers[question].description})</span></p>
                    </div>
                </div>
            `;
            questionNum++;
        }
        resultsHTML += '</div>';

        // diagnosis
        let confidenceMessage = '';
        if (correctCount < 5) {
            confidenceMessage = 'You are extremely over confident! With appropriate confidence, the correct answer should have been within your range for 9 out of the 10 questions.';
        } else if (correctCount <= 8) {
            confidenceMessage = 'You are overconfident. With appropriate confidence, the correct answer should have been within your range for 9 out of the 10 questions.';
        } else if (correctCount === 9) {
            confidenceMessage = 'Congratulations! You have appropriate confidence. With appropriate confidence, the correct answer will be within your range for 9 out of the 10 questions.';
        } else {
            confidenceMessage = 'Wow! You are one of the rare people who are under-confident. With appropriate confidence the correct answer should have been within your range for 9 out of the 10 questions. You got all 10, which suggests you could be a bit more confident in your assessments.';
        }

        // quiz summary
        resultsHTML += `
            <div class="card border">
                <div class="card-body p-4">
                    <h5 class="text-center mb-3">Final Score: ${correctCount} out of ${Object.keys(answers).length}</h5>
                    <hr>
                    <h6 class="mb-2">Confidence Assessment</h6>
                    <p class="mb-0">${confidenceMessage}</p>
                </div>
            </div>
        `;

        resultsHTML += '</div></div></div>';

        // prepare main content, hide quiz
        const quizContainer = document.querySelector('.quiz');
        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'results-page py-5';
        resultsDiv.innerHTML = resultsHTML;
        quizContainer.style.display = 'none';
        quizContainer.parentNode.insertBefore(resultsDiv, quizContainer.nextSibling);
        
        // show main content section
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.display = 'block';
        }
    });

    // Validate input on change
    quizForm.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('change', function() {
            const questionId = this.id.split('-')[0];
            const isLow = this.id.includes('-low');
            const pairInput = document.getElementById(`${questionId}-${isLow ? 'high' : 'low'}`);
            
            if (pairInput.value && this.value) {
                const low = parseFloat(isLow ? this.value : pairInput.value);
                const high = parseFloat(isLow ? pairInput.value : this.value);
                
                if (low >= high) {
                    this.setCustomValidity('High end must be greater than low end');
                } else {
                    this.setCustomValidity('');
                    pairInput.setCustomValidity('');
                }
            }
        });
    });
});