"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuizQuestionsContent = exports.sectionCompletedPct = exports.augmentCardWithGqlData = exports.getCardsFromSection = void 0;
const sections_1 = require("./sections");
const getCardsFromSection = ({ section, quizQuestionsContent, }) => {
    const quizzes = quizQuestionsContent.find((content) => section === content.section.id);
    return (quizzes === null || quizzes === void 0 ? void 0 : quizzes.content.map((card) => card)) || [];
};
exports.getCardsFromSection = getCardsFromSection;
const augmentCardWithGqlData = ({ card, quizServerData, }) => {
    const myQuiz = quizServerData.find((quiz) => quiz.id === card.id);
    return Object.assign(Object.assign({}, card), { amount: (myQuiz === null || myQuiz === void 0 ? void 0 : myQuiz.amount) || 0, completed: (myQuiz === null || myQuiz === void 0 ? void 0 : myQuiz.completed) || false });
};
exports.augmentCardWithGqlData = augmentCardWithGqlData;
const sectionCompletedPct = ({ quizServerData, section, quizQuestionsContent, }) => {
    const cardsOnSection = (0, exports.getCardsFromSection)({
        section,
        quizQuestionsContent,
    });
    const cards = cardsOnSection.map((card) => (0, exports.augmentCardWithGqlData)({ card, quizServerData }));
    try {
        return (cards === null || cards === void 0 ? void 0 : cards.filter((item) => item === null || item === void 0 ? void 0 : item.completed).length) / cards.length;
    }
    catch (err) {
        console.error(err);
        return 0;
    }
};
exports.sectionCompletedPct = sectionCompletedPct;
const getQuizQuestionsContent = ({ LL, }) => {
    const LLEarn = LL.EarnScreen.earnSections;
    const quizSectionContent = Object.keys(sections_1.earnSections).map((sectionId) => ({
        section: {
            id: sectionId,
            title: LLEarn[sectionId].title(),
        },
        content: sections_1.earnSections[sectionId].questions.map((question) => {
            // we would need more precise type to infer correctly the type here
            // because we are filtering with EarnSectionType, we are only looking through one section
            // at a time. but the questions are from all the types, so typescript
            // cant infer the type correctly
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const questions = LLEarn[sectionId].questions[question];
            return {
                id: question,
                title: questions.title(),
                text: questions.text(),
                question: questions.question(),
                answers: Object.values(questions.answers).map(
                // need to execute the function to get the value
                (answer) => answer()),
                feedback: Object.values(questions.feedback).map(
                // need to execute the function to get the value
                (feedback) => feedback()),
            };
        }),
    }));
    return quizSectionContent;
};
exports.getQuizQuestionsContent = getQuizQuestionsContent;
//# sourceMappingURL=earns-utils.js.map