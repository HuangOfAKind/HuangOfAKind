document.addEventListener('DOMContentLoaded', function() {
    const quizForm = document.getElementById('quiz-form');
    if (!quizForm) return;

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
        alert('Thank you for your answers!');
        quizForm.reset();
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