# Machine Learning Engineering Principles

## ML Through a Clean Code Lens

Machine learning code is STILL code. It needs tests, clean design, and maintainability. The unique challenge: ML adds data and models as additional axes of complexity.

## Clean ML Architecture

### Separation of Concerns
- **Data pipeline**: Ingestion, cleaning, transformation. Separate from model code.
- **Feature engineering**: Transforming raw data into model inputs. Versioned and reproducible.
- **Model training**: The learning algorithm. Configurable, not hardcoded.
- **Model serving**: Prediction API. Decoupled from training.
- **Monitoring**: Track model performance in production. Detect drift.

Each layer should be independently testable and deployable.

### The Dependency Rule Applied
- Domain logic (business rules about what predictions mean) at the center.
- ML frameworks (TensorFlow, PyTorch, scikit-learn) are DETAILS at the outer layer.
- A model behind an interface: `Predictor.predict(input) -> output`. The consumer does not know if it is a neural network, a decision tree, or a hardcoded rule.

## Testing ML Systems

### Unit Tests for ML
- Test data transformations: input X produces output Y.
- Test feature engineering: raw data -> expected features.
- Test model loading: model file loads without error.
- Test prediction format: output has the expected shape and types.

### Integration Tests
- Test the full pipeline: raw data -> features -> prediction -> response.
- Test with known inputs and expected outputs.
- Test edge cases: missing data, unexpected values, empty input.

### Model Validation (NOT Unit Tests)
- Accuracy, precision, recall, F1 on a held-out test set.
- These are not deterministic tests -- they are statistical evaluations.
- Set thresholds: "Model must achieve >90% accuracy on the test set."
- Run as part of the CI pipeline before deployment.

### Data Tests
- Schema validation: expected columns, types, ranges.
- Distribution checks: does the new data look like the training data?
- Null/missing checks: are there unexpected missing values?
- These catch data pipeline failures BEFORE they reach the model.

## Reproducibility

"If you cannot reproduce the result, you do not understand it."

### Version Everything
- **Code**: Git (obvious).
- **Data**: Version datasets. DVC (Data Version Control) or similar.
- **Models**: Version trained models. Tag with the data and code that produced them.
- **Configuration**: Hyperparameters, feature flags, environment settings.
- **Environment**: Pin library versions. Use containers.

### Experiment Tracking
- Log every training run: parameters, metrics, artifacts.
- Tools: MLflow, Weights & Biases, Neptune.
- The ability to compare experiments and reproduce results is essential.

## Technical Debt in ML (Sculley et al., "Hidden Technical Debt in Machine Learning Systems")

ML systems accumulate unique forms of technical debt:

### Data Dependencies
- Models depend on data, and data changes silently.
- A change in an upstream data source can silently degrade model performance.
- Monitor data distributions in production. Alert on drift.

### Pipeline Jungles
- Glue code connecting data sources, preprocessing steps, models, and outputs.
- This is the ML equivalent of spaghetti code.
- Fix: clean pipeline abstractions, clear interfaces between stages.

### Dead Experimental Codepaths
- Old model versions, abandoned features, commented-out transformations.
- Uncle Bob's Clean Code principle: delete dead code. It applies to ML code too.

### Feedback Loops
- Models that influence the data they are trained on (e.g., recommendation systems).
- The model's predictions change user behavior, which changes the training data, which changes the model.
- These loops can be self-reinforcing and hard to debug.

## MLOps and CI/CD for ML

### The ML Pipeline
```
Data -> Feature Store -> Training -> Validation -> Model Registry -> Deployment -> Monitoring
```

Each stage is automated. Failure at any stage blocks deployment.

### Model Monitoring
- **Performance drift**: Model accuracy degrades over time as the world changes.
- **Data drift**: Input data distribution changes from what the model was trained on.
- **Concept drift**: The relationship between inputs and outputs changes.
- Automated alerts when drift is detected. Trigger retraining.

## Training Sources
- "Clean Code" -- Robert C. Martin (principles apply to ML code)
- "Clean Architecture" -- Robert C. Martin (separation of concerns)
- Sculley et al. -- "Hidden Technical Debt in Machine Learning Systems" (NIPS 2015)
- "Designing Machine Learning Systems" -- Chip Huyen
- "Reliable Machine Learning" -- Cathy Chen et al.
- Conflicting: "ML is different from software engineering -- traditional principles don't apply." Response: ML is software engineering WITH additional concerns (data, models). Traditional principles still form the foundation.
