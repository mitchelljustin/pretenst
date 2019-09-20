module.exports = {
    "env": {
        "browser": true
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "project": "tsconfig.json",
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint",
        "@typescript-eslint/tslint"
    ],
    "rules": {
        "@typescript-eslint/adjacent-overload-signatures": "error",
        "@typescript-eslint/array-type": "error",
        "@typescript-eslint/ban-types": "error",
        "@typescript-eslint/class-name-casing": "error",
        "@typescript-eslint/explicit-member-accessibility": [
            "error",
            {
                "overrides": {
                    "constructors": "off"
                }
            }
        ],
        "@typescript-eslint/indent": "error",
        "@typescript-eslint/interface-name-prefix": "error",
        "@typescript-eslint/member-delimiter-style": "off",
        "@typescript-eslint/no-angle-bracket-type-assertion": "off",
        "@typescript-eslint/no-empty-interface": "error",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-parameter-properties": "off",
        "@typescript-eslint/no-triple-slash-reference": "error",
        "@typescript-eslint/no-use-before-declare": "off",
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-function-type": "error",
        "@typescript-eslint/prefer-interface": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@typescript-eslint/promise-function-async": "error",
        "@typescript-eslint/type-annotation-spacing": "off",
        "@typescript-eslint/unified-signatures": "error",
        "arrow-body-style": "error",
        "arrow-parens": [
            "off",
            "as-needed"
        ],
        "complexity": "off",
        "constructor-super": "error",
        "curly": "error",
        "dot-notation": "error",
        "eol-last": "error",
        "guard-for-in": "error",
        "linebreak-style": "off",
        "max-classes-per-file": "off",
        "member-ordering": "error",
        "new-parens": "off",
        "newline-per-chained-call": "off",
        "no-bitwise": "off",
        "no-caller": "error",
        "no-cond-assign": "error",
        "no-console": "off",
        "no-debugger": "off",
        "no-empty": "off",
        "no-empty-functions": "off",
        "no-eval": "error",
        "no-extra-semi": "off",
        "no-fallthrough": "off",
        "no-invalid-this": "off",
        "no-irregular-whitespace": "off",
        "no-multiple-empty-lines": [
            "error",
            {
                "max": 2
            }
        ],
        "no-new-wrappers": "error",
        "no-throw-literal": "error",
        "no-undef-init": "error",
        "no-unsafe-finally": "error",
        "no-unused-labels": "error",
        "no-var": "error",
        "object-shorthand": "error",
        "one-var": "error",
        "prefer-const": "off",
        "quote-props": "off",
        "radix": "error",
        "space-before-function-paren": "off",
        "use-isnan": "error",
        "valid-typeof": "off",
        "@typescript-eslint/tslint/config": [
            "error",
            {
                "rulesDirectory": [
                    "/Users/mitch/Developer/galapagotchi/node_modules/tslint-react/rules"
                ],
                "rules": {
                    "comment-format": [
                        true,
                        "check-space"
                    ],
                    "jsdoc-format": true,
                    "jsx-boolean-value": true,
                    "jsx-key": true,
                    "jsx-no-bind": true,
                    "jsx-no-string-ref": true,
                    "jsx-self-close": true,
                    "max-line-length": [
                        true,
                        160
                    ],
                    "no-null-keyword": true,
                    "no-reference-import": true,
                    "no-shadowed-variable": true,
                    "no-trailing-whitespace": true,
                    "no-unused-expression": true,
                    "only-arrow-functions": [
                        true,
                        "allow-declarations",
                        "allow-named-functions"
                    ],
                    "ordered-imports": [
                        true,
                        {
                            "grouped-imports": true
                        }
                    ],
                    "quotemark": [
                        true,
                        "double"
                    ],
                    "semicolon": [
                        true,
                        "never"
                    ],
                    "trailing-comma": [
                        true,
                        {
                            "multiline": "always",
                            "singleline": "never"
                        }
                    ],
                    "triple-equals": [
                        true,
                        "allow-null-check"
                    ],
                    "typedef": [
                        true,
                        "call-signature",
                        "parameter",
                        "property-declaration"
                    ],
                    "variable-name": [
                        true,
                        "allow-leading-underscore",
                        "require-const-for-all-caps",
                        "allow-pascal-case"
                    ]
                }
            }
        ]
    }
};
