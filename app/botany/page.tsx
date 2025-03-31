"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { BotanyCard } from "@/components/botany/botany-card";
import { useConvex } from "convex/react";
import { Doc } from "@/convex/_generated/dataModel";

export default function Botany() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const convex = useConvex();

  const [searchRules, setSearchRules] = useState([
    { id: 1, index: "fullName", value: "" },
  ]);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Doc<"botany">[]>([]);

  const fetchResults = useCallback(
    async (rules: typeof searchRules) => {
      const validRules = rules.filter((r) => r.value.trim());
      const searchResults = await convex.query(api.botany.searchPlants, {
        limit: 30,
        query: validRules,
      });
      setResults(searchResults);
    },
    [convex],
  );

  const handleSearch = useCallback(async () => {
    const encoded = encodeURIComponent(JSON.stringify(searchRules));
    router.push(`/botany?query=${encoded}`);
  }, [searchRules, router]);

  // Handle URL search params
  useEffect(() => {
    const query = searchParams.get("query");
    if (query) {
      try {
        const parsed = JSON.parse(decodeURIComponent(query));
        setSearchRules(parsed);
        fetchResults(parsed);
      } catch {
        fetchResults([{ id: 1, index: "fullName", value: "" }]);
      }
    } else {
      fetchResults([{ id: 1, index: "fullName", value: "" }]);
    }
  }, [searchParams, fetchResults]);

  const render = () => {
    return (
      <div className="w-full min-h-screen bg-gradient-to-b from-white to-gray-50/50">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {renderSearch()}
          {renderSearchResults()}
        </div>
      </div>
    );
  };

  const renderSearch = () => {
    const renderSearchInputAndButton = () => {
      const handleRuleChange = (id: number, key: string, newValue: string) => {
        setIsSearching(false);
        setSearchRules((rules) =>
          rules.map((rule) =>
            rule.id === id ? { ...rule, [key]: newValue } : rule,
          ),
        );
      };

      const addSearchRule = () => {
        setSearchRules((rules) => [
          ...rules,
          { id: Date.now(), index: "fullName", value: "" },
        ]);
      };

      const removeSearchRule = (id: number) => {
        setSearchRules((rules) => rules.filter((rule) => rule.id !== id));
      };

      const clearSearch = () => {
        setIsSearching(false);
        setSearchRules([{ id: 1, index: "fullName", value: "" }]);
        router.push("/botany");
      };

      return (
        <div className="flex flex-col gap-3 w-full">
          {searchRules.map((rule) => (
            <div key={rule.id} className="flex gap-2 items-center">
              <select
                value={rule.index}
                onChange={(e) =>
                  handleRuleChange(rule.id, "index", e.target.value)
                }
                className="px-3 py-2 rounded-lg border border-green-300 bg-white text-sm"
              >
                <option value="fullName">Full Name</option>
                <option value="country">Country</option>
                <option value="collectors">Collectors</option>
                <option value="state">State</option>
              </select>
              <Input
                value={rule.value}
                placeholder={`Search ${rule.index}...`}
                onChange={(e) =>
                  handleRuleChange(rule.id, "value", e.target.value)
                }
                className="flex-1"
              />
              {searchRules.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSearchRule(rule.id)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          <div className="flex gap-3">
            <Button
              onClick={addSearchRule}
              variant="outline"
              className="text-green-700"
            >
              + Add Search Rule
            </Button>
            <Button onClick={handleSearch}>Search</Button>
            {isSearching && (
              <Button
                onClick={clearSearch}
                variant="ghost"
                className="text-red-600"
              >
                Clear Search
              </Button>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="relative">
        {/* Decorative background elements */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 right-0 h-72 w-72 rounded-full bg-green-100/30 blur-3xl"></div>
          <div className="absolute -top-20 left-0 h-72 w-72 rounded-full bg-emerald-100/30 blur-3xl"></div>
        </div>

        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2 bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
            Botany Collection Search
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Explore our extensive database of botanical specimens
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-8">
          <div className="flex gap-3">{renderSearchInputAndButton()}</div>
        </div>
      </div>
    );
  };

  const renderSearchResults = () => {
    return (
      <div className="relative">
        {/* Results count */}
        {results && results.length > 0 && (
          <div className="mb-6 text-gray-600">
            Showing{" "}
            <span className="font-medium text-green-700">{results.length}</span>{" "}
            specimens
            {isSearching && (
              <span className="ml-2 text-gray-500">(Filtered results)</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 auto-rows-fr">
          {results === undefined || results.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <div className="text-gray-500 space-y-2">
                <p className="text-lg">
                  No specimens found matching your search.
                </p>
                <p className="text-sm">
                  Try adjusting your search terms or filters.
                </p>
              </div>
            </div>
          ) : (
            results.map((plant) => <BotanyCard key={plant._id} plant={plant} />)
          )}
        </div>
      </div>
    );
  };

  return render();
}
