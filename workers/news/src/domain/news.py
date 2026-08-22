from pydantic import BaseModel, Field

class NewsItems(BaseModel):
    id: str = Field(min_length=1)
    sourceId: str = Field(min_length=1)
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    url: str = Field(min_length=1)
    publishedAt: str = Field(min_length=1)
    crawledAt: str = Field(min_length=1)
    relatedCoins: list[str] = Field(default_factory=list)