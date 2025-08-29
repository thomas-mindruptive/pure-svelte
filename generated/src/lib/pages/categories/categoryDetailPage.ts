// Data loading and business logic for the CategoryDetailPage
// TODO: Import your API clients here.------------------------------------------------------

// We use _event to signal that the parameter might be unused (e.g., on list pages),
// which is a standard convention supported by TypeScript and ESLint.
export async function load(_event: PageLoadEvent) {
    console.log(`Loading data for CategoryDetailPage with ID: ${_event.params.categoryId}`);

    // TODO: Replace this with your actual data fetching logic.
    // const pageData = await yourApiClient.getById(id);

    // Dummy data for scaffolding purposes:
    const pageData = {
        id: Number(_event.params.categoryId),
        message: 'This is loaded data for CategoryDetailPage.'
    };

    return pageData;
}