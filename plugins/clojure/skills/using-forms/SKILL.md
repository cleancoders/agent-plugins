---
name: using-forms
description: Use when creating or modifying forms in ClojureScript. Covers forms/config, forms/submit-button, field-set, validation, error handling, and server-side form error responses.
---

# Using Forms in ClojureScript

All forms must use the `cleancoders.forms.core` pattern. Never use raw `[:button {:on-click ...}]` for form submission or raw `ajax/post!` for form endpoints.

## Client-Side Pattern

### 1. Create a form config

```clojure
(def my-conf (forms/config schema ratom url success-handler))
```

- **schema**: Validation schema (from `cleancoders.schema.*`) - validates client-side before POST
- **ratom**: Reagent atom holding form state
- **url**: API endpoint to POST to
- **success-handler**: `(fn [payload] ...)` called on successful (non-error) response
- **options** (optional 5th arg): Map with `:captcha?`, etc.

### 2. Use field-set for labeled fields with error display

```clojure
(forms/field-set "Label" forms/email-field {:id "-my-field"} :field-key my-conf)
(forms/field-set "Label" forms/text-field {:id "-my-field"} :field-key my-conf)
(forms/field-set "Label" forms/password-field {:id "-my-field"} :field-key my-conf)
```

`field-set` wraps the input with a label and error display. The `{:id "-my-field"}` sets the fieldset div id; the input gets id `"-my-field-input"`.

### 3. Use submit-button for form submission

```clojure
(forms/submit-button "Submit" {:id "-my-submit"} my-conf can-submit?)
(forms/submit-button-post "Save" {:id "-my-save"} my-conf can-submit? [:span.fa-solid.fa-icon])
```

- Renders `[:button.primary ...]` with disabled state, spinner, and CAPTCHA support
- `can-submit?` controls whether the button is enabled (in addition to processing state)
- Calls `forms/attempt-submit` on click, which validates against schema first
- Variants: `submit-button`, `submit-button-post`, `submit-button-fixed`, `submit-button-small`

### 4. Other field types

```clojure
(forms/checkbox-field-set {:id "-my-check"} :field-key my-conf [:span "Label text"])
(forms/toggle-switch-field-set {:id "-my-toggle"} :field-key my-conf "Label text")
(forms/radio-button {:id "-my-radio"} :field-key value my-conf)
```

## How Submission Works

1. User clicks submit button
2. `attempt-submit` validates form state against schema client-side
3. If invalid: stores errors in ratom under `:errors` and sets `:display-errors? true` — field-set components display errors automatically
4. If valid: calls `schema/present!` to transform data, sets `:_processing? true` (disables button, shows spinner), POSTs to server
5. Server response goes through `capture-errors-handler`:
   - If response contains `{:errors {...}}`: stores errors in ratom, displays them
   - Otherwise: calls `success-handler` with the payload

## Server-Side Form Error Response

Use `maybe-validation-errors-for-form` to return validation errors that the form will display inline (no flash message):

```clojure
(defn api-my-endpoint [request]
  (let [conformed (schema/conform my-schema (:params request))]
    (or (maybe-validation-errors-for-form conformed)
        (do-the-thing conformed))))
```

This returns `(ajax/ok {:errors {...}})` which the client form's `capture-errors-handler` intercepts and displays inline.

**Do NOT use** `ajax/maybe-validation-errors` for form endpoints — it sends a flash message instead of inline errors.

## Complete Example

### Client (CLJS)
```clojure
(def my-state (page/cursor [:my-form]))

(defn- handle-success [payload] ...)

(def my-conf (forms/config my-schema/thing my-state "/api/v1/my-endpoint" handle-success))

(defn my-form []
  [:form
   (forms/field-set "Name" forms/text-field {:id "-my-name"} :name my-conf)
   (forms/field-set "Email" forms/email-field {:id "-my-email"} :email my-conf)
   (forms/submit-button "Save" {:id "-my-submit"} my-conf true)])
```

### Server (CLJ)
```clojure
(defn api-my-endpoint [request]
  (let [conformed (schema/conform my-schema/thing (:params request))]
    (or (maybe-validation-errors-for-form conformed)
        (let [result (process conformed)]
          (ajax/ok result)))))
```

## Key Rules

- **Always use `forms/config`** — never manually call `ajax/post!` for form submissions
- **Always use `forms/submit-button`** — never use raw `[:button]` for form submit
- **Use `forms/field-set`** for labeled inputs — it handles error display automatically
- **Use `maybe-validation-errors-for-form`** on the server for form endpoints
- **IDs must be hyphen-prefixed** (e.g., `"-my-field"`) per project convention for test/dev hooks
