# Introduction

## Problem Statement and Background

Very close groups of friends online or in-person develop an internal
situational humour built on situational jokes that happen spontaneously.
Those would get to use by referring to the same situation to make fun of
it. In Slovakia we call this "džingel". Meaning of a džingel depends
heavily on the situation. Over time those could fade out of memory or
get scattered in communication chats.

This document proposes a lightweight web app system that is privacy
focused, thus targeting the self-hosting community and not using the
already available cloud services. Note application is not built to cover
someone saying something or share a list of jokes in between the group
easily. This app could be in a category of a note taking app so its not
new [@quotedump] but very niche for a specific use case being in a
enhanced market category.

### Users {#users .unnumbered}

Group of skilled users consists of any persons that are comfortable with
technology and require no need of explanation or accessibility features.

Group of young 7-17s, thus meaning children would be able to use this.
Accordingly, as this app involves user data storage it would add
parental oversight features.

Vulnerable people are the one who need extra accessibility features.
Being able to navigate across and understand the usage. Giving it an
easy low-friction working system to use for anyone.

Older people would be those about who are expected to use the system the
least. This is a replacement of old-fashioned note taking on paper if
ever would be these things taken. Persons aging over 65 will use to
understand the jokes of new generation and reading the context of the
situation, thus keeping up with the usability of getting them involved
and connected.

### Actors {#actors .unnumbered}

Developer sits on the side of software development. Admin deploys this
app on any self-hosted capable device. Could be a NAS or any other home
lab. Admins also take care of user identity management. Whereas users
are normal people interacting with the web.

## Objectives

Focus of this document is to provide clear structure of the web-based
application.

1.  Architectural objective: Design a 3-tier architecture.

2.  Implementation objective: Develop the proposed web browser system
    with the core functionality needed to address the identified
    problem.

3.  Testing and evaluation objective: Expectation of a lightweight
    system is 200MB of 50 requests per second and 4% CPU usage.

## Justification

Me personally came to a situation where I couldn't understand some
jokes, so I kept asking. Same way around someone was asking about some
stuff and there were situations when it happens to be hard to recall the
exact context.

# Proposed Three-Tier Architectural Design of the Web Browser

## Architectural Overview

On the selfhosted way DB would be mapped as a docker volume directly to
a container running Hono [@hono]. Second container would be deployed to
deliver Astro [@astro] rendered html and css over NGINX.

The whole project is open sourced, thus providing a deployment guide to
deploy this stack at anyone's infrastructure. This will achieve 100%
privacy.

3-tier fits this as it is the basic standard when building a
cloud-native web app for horizontal scalability and separation of
concerns. Each tier can be replaced later with any other system. A DB
can be migrated and the whole system stays intact. Docker-compose is the
declarative script to deploy this simply while each tier leaves in a
different isolated container.

## Presentation Tier --- User Interface

Frontend, the part that runs in web browser must be very clean and
accessible. Login page. Settings for the admin to adjust server. Group
management for quote sharing and inside of that a rolling list of
quotes. Edit page that would create or update these quote records.
Search bar on top to retrieve any past quotes or context what it was
about. In the header would be the logo and if the admin logged in a
settings icon.

## Application Tier --- Business Logic

User authenticates and gets designated role. By this role they come in
and do authorised actions. Input data in the create section, this form
has validation to provide security layer to the data.

Core operations are to create, edit, share and search those quotes. This
tier is the bridge between data and the browser.

## Data Tier --- Data Persistence

SQLite [@sqlite] is the proposed technology to store all data. No media
or big file storage is needed. Uses SQL thus being well-structured data
to provide fast retrieval.

Tables in the database consist of users, quotes, groups.

SQLite is lightweight, just one file mapped as a docker volume. The
biggest limitation is the concurrency. Only one user at a time.

## Security, Performance

- Security: Defence in depth is applied to protect the data stored in
  SQLite database over multiple layers. Frontend validation, server user
  granular authorization. HTTPS forced on every public route. NGINX
  lives in a docker network connecting to backend inside. Privacy is
  defined here that all the data is being stored on the user's machine.

- Performance: Response target latency is 100ms by using light
  frameworks.

- Efficiency: Target is to achieve 200MB and 4% CPU usage at 50
  concurrent connections.

## Architectural Diagram

This diagram explains the flow how the system is accessed and shows each
tier in isolation to the other. Separation of concerns, what the
specific tier does. Added to this is a security audit happening in every
CICD run. Figure [1](#figure:1){reference-type="ref"
reference="figure:1"} shows the architecture.

<figure id="figure:1" data-latex-placement="htbp">

<figcaption>- Architecture diagram</figcaption>
</figure>

# Proposed Implementation

## Implementation Objectives

- Build the user interface with nice, polished design.

- User management, quote creation and group sharing

- Simple keyword search

## Proposed Technology Stack

Frontend: Astro, which is a very lightweight framework keeping
JavaScript minimal.

Application logic: Hono written in typescript and makes the system fast.

Database: SQLite, one file, one SQL database. Keeps it simple.

Development platform: GitHub Actions [@githubactions] and suggested
Watchtower [@watchtower] container. Git tag deployment to auto build
containers and push into docker hub.

## Implementation Scope

In scope: An MVP web app covering the core features. User, quote and
server management.

Out of scope:

Media uploads. Cloud deployment comes at later stage but here is the
priority to keep it privacy focused. 2 menu bar limitation and SQLite
concurrency limitations come to create a place for upgrade at later
stages. RAG search could be great enhancement.

# Proposed Testing and Evaluation

## Functional Testing

Core features, managing groups and quotes are all tested every GitHub
action deployment using unit tests.

## Security Testing

End to end testing is required. Covers the static analysis using Snyk
audit [@snyk] and dynamic application security testing OWASP ZAP [@zap].

## Performance and Resource Evaluation

Locust as a testing framework would be used to run scripts and deliver
summaries of the performance.

# Conclusion

The problem is identified as scattered messages across multiple chatting
platforms and this simple 3tier web app provides a solution to keep
internal jokes at one place. Later stages could involve situational
context RAG search.
