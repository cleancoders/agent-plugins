#!/usr/bin/env python3
"""
Validation Runner for Clean Code Craftsmen

Executes validation suites (quiz, code-review, kata) against agents
by loading the agent's context and testing its knowledge through
structured evaluation.

This module provides both programmatic API and CLI usage.

Usage:
    python3 validate.py <agent-name> [--tier 1|2|3|all] [--verbose]
    python3 validate.py tdd --tier 1
    python3 validate.py solid --tier 2 --verbose
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent.parent
AGENTS_DIR = ROOT_DIR / "agents"
FRAMEWORK_DIR = ROOT_DIR / "framework"
RESULTS_DIR = ROOT_DIR / "validation-results"


def load_agent_context(agent_name):
    """Load an agent's full context via loader.sh."""
    loader = FRAMEWORK_DIR / "loader.sh"
    result = subprocess.run(
        [str(loader), agent_name, "--format", "full"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise ValueError(f"Failed to load agent '{agent_name}': {result.stderr}")
    return result.stdout


def load_agent_config(agent_name):
    """Load an agent's config.json."""
    config_path = AGENTS_DIR / agent_name / "config.json"
    if config_path.exists():
        with open(config_path) as f:
            return json.load(f)
    return {}


def load_validation_file(agent_name, filename):
    """Load a validation JSON file for an agent."""
    filepath = AGENTS_DIR / agent_name / "validation" / filename
    if not filepath.exists():
        return None
    with open(filepath) as f:
        return json.load(f)


# --- Tier 1: Quiz Validation ---

def evaluate_quiz_answer(answer, expected_keywords, points):
    """
    Evaluate a quiz answer by checking for expected keywords.
    Returns (score, max_points, matched_keywords, missing_keywords).
    """
    answer_lower = answer.lower()
    matched = []
    missing = []
    for kw in expected_keywords:
        if kw.lower() in answer_lower:
            matched.append(kw)
        else:
            missing.append(kw)

    if not expected_keywords:
        return points, points, [], []

    ratio = len(matched) / len(expected_keywords)
    score = round(ratio * points, 2)
    return score, points, matched, missing


def build_quiz_prompt(agent_context, questions):
    """Build a prompt that asks the agent all quiz questions."""
    prompt = f"""{agent_context}

---
# Validation Quiz

Answer each question based on your expert knowledge. Be thorough but concise.
Format your answers as:

Q1: [your answer]
Q2: [your answer]
...

Questions:
"""
    for i, q in enumerate(questions, 1):
        prompt += f"\nQ{i}: {q['question']}"

    return prompt


def parse_quiz_responses(response_text, num_questions):
    """Parse numbered responses from the agent's output."""
    answers = {}
    # Try to find Q1:, Q2:, etc.
    for i in range(1, num_questions + 1):
        pattern = rf'Q{i}:\s*(.*?)(?=Q{i+1}:|$)'
        match = re.search(pattern, response_text, re.DOTALL)
        if match:
            answers[i] = match.group(1).strip()
        else:
            answers[i] = ""
    return answers


def run_quiz_validation(agent_name, agent_context, verbose=False):
    """
    Run Tier 1 quiz validation.
    Returns dict with score, max_score, pass_threshold, passed, details.
    """
    quiz_data = load_validation_file(agent_name, "quiz.json")
    if not quiz_data:
        return {"skipped": True, "reason": "No quiz.json found"}

    questions = quiz_data.get("questions", [])
    if not questions:
        return {"skipped": True, "reason": "No questions in quiz.json"}

    config = load_agent_config(agent_name)
    threshold = config.get("validation", {}).get("quizPassThreshold", 0.9)

    prompt = build_quiz_prompt(agent_context, questions)

    result = {
        "tier": 1,
        "type": "quiz",
        "agent": agent_name,
        "num_questions": len(questions),
        "threshold": threshold,
        "prompt": prompt,
        "prompt_length": len(prompt),
        "evaluation_criteria": [],
        "status": "ready"
    }

    for i, q in enumerate(questions, 1):
        result["evaluation_criteria"].append({
            "question_id": q["id"],
            "question": q["question"],
            "expected_keywords": q["expected_keywords"],
            "points": q["points"]
        })

    max_score = sum(q["points"] for q in questions)
    result["max_score"] = max_score
    result["pass_score"] = round(max_score * threshold, 2)

    if verbose:
        print(f"  Quiz: {len(questions)} questions, {max_score} total points")
        print(f"  Pass threshold: {threshold} ({result['pass_score']} points)")
        print(f"  Prompt length: {len(prompt)} chars")

    return result


# --- Tier 2: Code Review Validation ---

def build_code_review_prompt(agent_context, sample):
    """Build a prompt asking the agent to review a code sample."""
    prompt = f"""{agent_context}

---
# Code Review Exercise

Review the following code through your expert lens. Identify ALL issues by severity:
- CRITICAL: Must fix (bugs, security, fundamental violations)
- WARNING: Should fix (maintainability, design smells)
- SUGGESTION: Consider fixing (style, minor improvements)

If the code is well-written, explain what makes it good.

Language: {sample.get('language', 'unknown')}

```{sample.get('language', '')}
{sample['code']}
```

List your findings. For each finding, explain: what is wrong, why it matters, and how to fix it.
"""
    return prompt


def run_code_review_validation(agent_name, agent_context, verbose=False):
    """
    Run Tier 2 code review validation.
    Returns dict with samples, prompts, and evaluation criteria.
    """
    review_data = load_validation_file(agent_name, "code-review.json")
    if not review_data:
        return {"skipped": True, "reason": "No code-review.json found"}

    samples = review_data.get("samples", [])
    if not samples:
        return {"skipped": True, "reason": "No samples in code-review.json"}

    config = load_agent_config(agent_name)
    threshold = config.get("validation", {}).get("reviewPassThreshold", 0.85)

    result = {
        "tier": 2,
        "type": "code-review",
        "agent": agent_name,
        "num_samples": len(samples),
        "threshold": threshold,
        "samples": [],
        "status": "ready"
    }

    for sample in samples:
        prompt = build_code_review_prompt(agent_context, sample)
        result["samples"].append({
            "sample_id": sample["id"],
            "label": sample["label"],
            "quality": sample["quality"],
            "expected_findings": sample["expected_findings"],
            "expected_severity": sample.get("severity", "unknown"),
            "prompt": prompt,
            "prompt_length": len(prompt),
            "evaluation": {
                "method": "keyword_match",
                "expected_keywords": sample["expected_findings"],
                "quality_detection": sample["quality"]
            }
        })

    if verbose:
        print(f"  Code Review: {len(samples)} samples")
        print(f"  Pass threshold: {threshold}")
        for s in result["samples"]:
            print(f"    - {s['label']} ({s['quality']}, {s['expected_severity']})")

    return result


# --- Tier 3: Kata Validation ---

def run_kata_validation(agent_name, agent_context, verbose=False):
    """
    Run Tier 3 kata validation.
    Returns dict with exercises and evaluation criteria.
    """
    kata_data = load_validation_file(agent_name, "kata.json")
    if not kata_data:
        return {"skipped": True, "reason": "No kata.json found"}

    exercises = kata_data.get("exercises", [])
    if not exercises:
        return {"skipped": True, "reason": "No exercises in kata.json"}

    config = load_agent_config(agent_name)
    threshold = config.get("validation", {}).get("kataPassThreshold", 0.8)

    result = {
        "tier": 3,
        "type": "kata",
        "agent": agent_name,
        "num_exercises": len(exercises),
        "threshold": threshold,
        "exercises": exercises,
        "status": "ready"
    }

    if verbose:
        print(f"  Kata: {len(exercises)} exercises")
        print(f"  Pass threshold: {threshold}")

    return result


# --- Evaluate Responses (Post-LLM) ---

def evaluate_quiz_response(quiz_result, responses):
    """
    Given quiz_result (from run_quiz_validation) and a dict of
    {question_number: answer_text}, evaluate and return scored results.
    """
    criteria = quiz_result["evaluation_criteria"]
    total_score = 0
    max_score = quiz_result["max_score"]
    details = []

    for i, criterion in enumerate(criteria, 1):
        answer = responses.get(i, "")
        score, points, matched, missing = evaluate_quiz_answer(
            answer, criterion["expected_keywords"], criterion["points"]
        )
        total_score += score
        details.append({
            "question_id": criterion["question_id"],
            "question": criterion["question"],
            "score": score,
            "max_points": points,
            "matched_keywords": matched,
            "missing_keywords": missing,
            "answer_excerpt": answer[:200]
        })

    passed = (total_score / max_score) >= quiz_result["threshold"] if max_score > 0 else False

    return {
        "total_score": total_score,
        "max_score": max_score,
        "percentage": round(total_score / max_score * 100, 1) if max_score > 0 else 0,
        "threshold": quiz_result["threshold"],
        "passed": passed,
        "details": details
    }


def evaluate_code_review_response(sample_result, response_text):
    """
    Given a sample result and the LLM's review response,
    check how many expected findings were identified.
    """
    response_lower = response_text.lower()
    expected = sample_result["evaluation"]["expected_keywords"]
    matched = []
    missing = []

    for finding in expected:
        # Check if the core concept of the finding is mentioned
        finding_words = finding.lower().split()
        key_words = [w for w in finding_words if len(w) > 3]
        if any(w in response_lower for w in key_words):
            matched.append(finding)
        else:
            missing.append(finding)

    # Check if the quality (good/bad) was correctly identified
    quality = sample_result["quality"]
    quality_correct = False
    if quality == "bad":
        quality_correct = any(w in response_lower for w in [
            "issue", "problem", "violation", "wrong", "bad", "anti-pattern",
            "smell", "concern", "fix", "critical", "warning"
        ])
    elif quality == "good":
        quality_correct = any(w in response_lower for w in [
            "good", "clean", "well", "clear", "proper", "correct",
            "structured", "solid"
        ])

    score = len(matched) / len(expected) if expected else 1.0

    return {
        "sample_id": sample_result["sample_id"],
        "label": sample_result["label"],
        "expected_quality": quality,
        "quality_correctly_identified": quality_correct,
        "findings_score": round(score, 2),
        "matched_findings": matched,
        "missing_findings": missing,
        "response_excerpt": response_text[:300]
    }


# --- Full Validation Run ---

def run_validation(agent_name, tier="all", verbose=False):
    """
    Run validation for an agent. Returns the full validation report.
    The report includes prompts ready to send to an LLM and evaluation
    criteria for scoring the responses.
    """
    agent_dir = AGENTS_DIR / agent_name
    if not agent_dir.exists():
        return {"error": f"Agent '{agent_name}' not found"}

    if verbose:
        print(f"\nValidating agent: {agent_name}")
        print(f"{'='*50}")

    # Load agent context
    try:
        agent_context = load_agent_context(agent_name)
    except ValueError as e:
        return {"error": str(e)}

    results = {
        "agent": agent_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tiers": {}
    }

    if tier in ("1", "all"):
        if verbose:
            print("\n--- Tier 1: Quiz ---")
        results["tiers"]["quiz"] = run_quiz_validation(
            agent_name, agent_context, verbose
        )

    if tier in ("2", "all"):
        if verbose:
            print("\n--- Tier 2: Code Review ---")
        results["tiers"]["code_review"] = run_code_review_validation(
            agent_name, agent_context, verbose
        )

    if tier in ("3", "all"):
        if verbose:
            print("\n--- Tier 3: Kata ---")
        results["tiers"]["kata"] = run_kata_validation(
            agent_name, agent_context, verbose
        )

    # Save results
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    agent_results_dir = RESULTS_DIR / agent_name
    agent_results_dir.mkdir(exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    result_file = agent_results_dir / f"{timestamp}-validation.json"

    with open(result_file, "w") as f:
        # Don't write the full prompts to file to save space
        save_results = json.loads(json.dumps(results))
        for tier_key, tier_data in save_results.get("tiers", {}).items():
            if isinstance(tier_data, dict):
                tier_data.pop("prompt", None)
                for sample in tier_data.get("samples", []):
                    if isinstance(sample, dict):
                        sample.pop("prompt", None)
        json.dump(save_results, f, indent=2)

    if verbose:
        print(f"\nResults saved to: {result_file}")

    return results


# --- CLI ---

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate.py <agent-name> [--tier 1|2|3|all] [--verbose]")
        print("\nAvailable agents:")
        if AGENTS_DIR.exists():
            for d in sorted(AGENTS_DIR.iterdir()):
                if d.is_dir() and (d / "config.json").exists():
                    print(f"  {d.name}")
        sys.exit(1)

    agent_name = sys.argv[1]
    tier = "all"
    verbose = "--verbose" in sys.argv or "-v" in sys.argv

    for i, arg in enumerate(sys.argv):
        if arg == "--tier" and i + 1 < len(sys.argv):
            tier = sys.argv[i + 1]

    results = run_validation(agent_name, tier, verbose)

    if "error" in results:
        print(f"Error: {results['error']}")
        sys.exit(1)

    # Summary output
    print(f"\n{'='*50}")
    print(f"Validation Summary: {agent_name}")
    print(f"{'='*50}")

    for tier_name, tier_data in results.get("tiers", {}).items():
        if isinstance(tier_data, dict) and tier_data.get("skipped"):
            print(f"  {tier_name}: SKIPPED ({tier_data.get('reason', 'unknown')})")
        elif isinstance(tier_data, dict) and tier_data.get("status") == "ready":
            print(f"  {tier_name}: READY for LLM evaluation")
            if tier_name == "quiz":
                print(f"    Questions: {tier_data.get('num_questions', 0)}")
                print(f"    Max score: {tier_data.get('max_score', 0)}")
                print(f"    Pass score: {tier_data.get('pass_score', 0)}")
            elif tier_name == "code_review":
                print(f"    Samples: {tier_data.get('num_samples', 0)}")
            elif tier_name == "kata":
                print(f"    Exercises: {tier_data.get('num_exercises', 0)}")

    print(f"\nTo execute: send the generated prompts to an LLM adapter,")
    print(f"then call evaluate_quiz_response() / evaluate_code_review_response()")
    print(f"with the LLM's responses to get scored results.")


if __name__ == "__main__":
    main()
