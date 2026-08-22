# Crypto Market Intelligence Agent
> Simple Reflex Agent

This is an Agent that helps to crawl cypro-market-related news, then reviews those news and predict that each crypto coin will have any changes by those news.

```mermaid
graph TD
    subgraph "Core"
        direction TB
        
        A1["News Crawler"]
        A2["News Items Storage"]

        A3["Sentiment Model"]
        A4["Sentiment Results"]

        A5[Update Predictions]

        A1 --> A2
        A3 --> A4
        A2 --> A5
        A4 --> A5
    end

    subgraph "Agent" 
        direction TB

        B1["Old State"]
        B2["Crawler Tools"]
        B3["Sentiment Tools"]
        B4["Market Tools"]
        B5["New State"]
        B6["Update"]
        B7{"More Research"}

        B1 --> B2
        B1 --> B3
        B1 --> B4
        B2 --> B5
        B3 --> B5
        B4 --> B5
        B5 --> B6
        B
    end
```