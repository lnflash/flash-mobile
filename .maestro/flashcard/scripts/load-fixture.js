// Provisions the card fixture FIXTURE through the fixture server
// (scripts/e2e/card-fixtures.ts serve) and keeps its summary in output.fixture.
const response = http.post(FIXTURES_URL + "/load/" + FIXTURE, { body: "" })
if (!response.ok) {
  throw new Error(
    "fixture " + FIXTURE + " failed: " + response.status + " " + response.body,
  )
}
output.fixture = json(response.body)
