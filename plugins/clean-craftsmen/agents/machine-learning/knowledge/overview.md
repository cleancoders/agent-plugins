# Machine Learning Knowledge Overview

## ML Engineering Principles

### ML Code is Code
- Apply Clean Code principles: naming, functions, testing
- ML notebooks are for exploration; production ML is software
- Version control for code, data, models, and experiments
- Code review for ML code (including feature engineering)

### Testing ML Systems
- **Data tests**: Schema validation, distribution checks, null checks, range checks
- **Unit tests**: Feature engineering functions, preprocessing, utility code
- **Model tests**: Training convergence, prediction sanity checks, invariance tests
- **Integration tests**: End-to-end pipeline runs, serving endpoint checks
- **Performance benchmarks**: Model accuracy on held-out test set, latency, throughput

### Experiment Tracking
- Every experiment logged: hyperparameters, data version, model version, metrics
- Reproducibility: same inputs produce same outputs
- Compare experiments systematically
- Track not just accuracy but also latency, memory, and fairness

## ML Architecture

### Separation of Concerns
- Data ingestion is separate from feature engineering
- Feature engineering is separate from model training
- Model training is separate from model serving
- Monitoring is separate from all of the above

### The ML Pipeline
1. Data collection and validation
2. Feature engineering
3. Model training and evaluation
4. Model validation (against production model)
5. Model deployment
6. Monitoring (data drift, model drift, performance)

## Anti-Patterns
- "It works in my notebook" (no pipeline, no reproducibility)
- Untested feature engineering (most bugs live here)
- No data validation (garbage in, garbage out)
- Model-centric thinking (ignoring data quality, pipeline, and serving)
- No monitoring in production (silent model degradation)

## Training Sources
- "Designing Machine Learning Systems" by Chip Huyen
- "Rules of Machine Learning" by Martin Zinkevich
- Clean Code principles applied to ML engineering
- Conflicting view: "Move fast and break things" in ML vs. "ML systems need more discipline, not less"
