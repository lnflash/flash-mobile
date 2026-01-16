"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useQuizServer = void 0;
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const client_1 = require("@apollo/client");
(0, client_1.gql) `
  query quizSats {
    quizQuestions {
      id
      earnAmount
    }
  }

  query myQuizQuestions {
    me {
      id
      defaultAccount {
        id
        ... on ConsumerAccount {
          quiz {
            id
            amount
            completed
          }
        }
      }
    }
  }
`;
const useQuizServer = ({ fetchPolicy } = {
    fetchPolicy: "cache-first",
}) => {
    var _a, _b, _c, _d;
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data: dataAuth, loading: loadingAuth } = (0, generated_1.useMyQuizQuestionsQuery)({
        fetchPolicy,
        skip: !isAuthed,
    });
    const { data: dataUnauth, loading: loadingUnauth } = (0, generated_1.useQuizSatsQuery)({
        fetchPolicy,
        skip: isAuthed,
    });
    const loading = loadingAuth || loadingUnauth;
    let quizServerData;
    if (isAuthed) {
        quizServerData = (_b = (_a = dataAuth === null || dataAuth === void 0 ? void 0 : dataAuth.me) === null || _a === void 0 ? void 0 : _a.defaultAccount.quiz.slice()) !== null && _b !== void 0 ? _b : [];
    }
    else {
        quizServerData =
            (_d = (_c = dataUnauth === null || dataUnauth === void 0 ? void 0 : dataUnauth.quizQuestions) === null || _c === void 0 ? void 0 : _c.map((quiz) => {
                var _a, _b;
                return ({
                    __typename: "Quiz",
                    id: (_a = quiz === null || quiz === void 0 ? void 0 : quiz.id) !== null && _a !== void 0 ? _a : "id",
                    amount: (_b = quiz === null || quiz === void 0 ? void 0 : quiz.earnAmount) !== null && _b !== void 0 ? _b : 0,
                    completed: false,
                });
            })) !== null && _d !== void 0 ? _d : [];
    }
    return { loading, quizServerData };
};
exports.useQuizServer = useQuizServer;
//# sourceMappingURL=use-quiz-server.js.map