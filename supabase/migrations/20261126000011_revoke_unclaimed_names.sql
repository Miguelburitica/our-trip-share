-- The generic link is served by the app now (decision 9); this helper only leaked first names to
-- anyone holding a trip id. Not callable by clients any more.
revoke execute on function public.trip_unclaimed_first_names from public, anon, authenticated;
