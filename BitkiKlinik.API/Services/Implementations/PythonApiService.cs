namespace BitkiKlinik.API.Services;

public interface IPythonApiService
{
    Task<string> AnalyzeImageAsync(Stream imageStream, string fileName);
}

public class PythonApiService : IPythonApiService
{
    private readonly HttpClient _httpClient;

    public PythonApiService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<string> AnalyzeImageAsync(Stream imageStream, string fileName)
    {
        // Example logic for calling the Python FastAPI service
        using var content = new MultipartFormDataContent();
        
        var streamContent = new StreamContent(imageStream);
        content.Add(streamContent, "file", fileName);

        // This assumes the Python service is running locally on port 8000
        var response = await _httpClient.PostAsync("http://localhost:8000/analyze", content);
        
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadAsStringAsync();
        }

        throw new HttpRequestException("Error communicating with Python API");
    }
}
